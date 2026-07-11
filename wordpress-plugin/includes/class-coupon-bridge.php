<?php
defined('ABSPATH') || exit;

/**
 * Puente de cupones de lealtad bajo demanda (multi-sede).
 *
 * Antes: Odoo empujaba el cupón a UN WooCommerce apenas se creaba la
 * loyalty.card (push anticipado, single-site). Con 3 subtiendas eso obligaba
 * a adivinar dónde va a pagar el cliente. Ahora el cupón NO existe en
 * WooCommerce hasta que alguien lo escribe en un checkout:
 *
 * 1. `woocommerce_get_shop_coupon_data` — cuando WC no encuentra el código
 *    localmente, se consulta a Odoo en vivo (`/api/loyalty/coupon-validate`).
 *    Si el código es una loyalty.card válida y no usada, se construye un
 *    cupón VIRTUAL (sin post en la base) con el descuento y la restricción
 *    de email del titular. Odoo es la única fuente de verdad.
 * 2. Al procesarse la orden, cada cupón virtual usado se consume en Odoo
 *    (`/api/loyalty/coupon-consume`, atómico) — a partir de ahí el código
 *    deja de validar en TODAS las sedes y en el POS físico.
 *
 * Los misses se cachean 5 minutos (transient) para no llamar a Odoo por
 * cada código basura tipeado en el checkout.
 */
class Popolo_Coupon_Bridge {

    private static ?self $instance = null;

    /** Cache en memoria de validaciones OK de este request (code => data) */
    private array $validated = [];

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_filter('woocommerce_get_shop_coupon_data', [$this, 'virtual_coupon'], 10, 2);

        // Consumo al quedar la orden creada — el checkout de este sitio es
        // 100% Store API (bloques); el hook clásico queda de red de seguridad.
        add_action('woocommerce_store_api_checkout_order_processed', [$this, 'consume_order_coupons'], 20);
        add_action('woocommerce_checkout_order_processed', [$this, 'consume_order_coupons_classic'], 20, 3);
    }

    /* ── Validación / cupón virtual ───────────────────────────────────── */

    /**
     * @param mixed  $data false, o datos ya resueltos por otro filtro
     * @param string $code código tal como lo tipeó el cliente
     */
    public function virtual_coupon($data, $code) {
        if ($data !== false || !$code) {
            return $data; // otro filtro ya lo resolvió
        }

        $code = wc_format_coupon_code((string) $code);

        // Si existe como cupón real de WC (post), no intervenimos
        if (wc_get_coupon_id_by_code($code)) {
            return $data;
        }

        $client = $this->client();
        if (!$client) {
            return $data;
        }

        // Miss cacheado: no volver a preguntar por 5 minutos
        $miss_key = 'popolo_coupon_miss_' . md5($code);
        if (get_transient($miss_key)) {
            return $data;
        }

        if (isset($this->validated[$code])) {
            $info = $this->validated[$code];
        } else {
            $info = $client->validate_coupon($code);
            if (!empty($info['valid'])) {
                $this->validated[$code] = $info;
            }
        }

        if (empty($info['valid'])) {
            set_transient($miss_key, 1, 5 * MINUTE_IN_SECONDS);
            return $data;
        }

        return [
            'discount_type'        => ($info['wc_discount_type'] ?? '') === 'fixed_cart' ? 'fixed_cart' : 'percent',
            'amount'               => (float) ($info['amount'] ?? 0),
            'individual_use'       => false,
            'usage_limit'          => 1,
            'usage_limit_per_user' => 1,
            'email_restrictions'   => !empty($info['partner_email']) ? [$info['partner_email']] : [],
            'description'          => sprintf('PopoloPizza Rewards — %s', $info['program_name'] ?? 'cupón'),
        ];
    }

    /* ── Consumo al procesar la orden ─────────────────────────────────── */

    public function consume_order_coupons(WC_Order $order): void {
        $client = $this->client();
        if (!$client) {
            return;
        }

        foreach ($order->get_coupon_codes() as $code) {
            // Solo los virtuales son nuestros: los cupones reales de WC
            // (posts) llevan su propio control de uso local
            if (wc_get_coupon_id_by_code($code)) {
                continue;
            }

            $result = $client->consume_coupon($code, (string) $order->get_id(), popolo_loyalty_source_slug());

            if (!empty($result['success'])) {
                $order->add_order_note(sprintf(
                    'Popolo Loyalty: cupón %s consumido en Odoo (titular: %s).',
                    $code, $result['partner_name'] ?? '—'
                ));
            } elseif (!empty($result['already_used'])) {
                // Carrera perdida: otro pedido (otra sede o el POS) lo gastó
                // entre la validación y el pago. La orden ya existe — se deja
                // constancia bien visible para revisión manual.
                $order->add_order_note(sprintf(
                    '⚠️ Popolo Loyalty: el cupón %s YA había sido usado en otro canal '
                    . 'cuando se procesó esta orden — revisar el descuento aplicado.',
                    $code
                ));
            } else {
                $order->add_order_note(sprintf(
                    '⚠️ Popolo Loyalty: no se pudo consumir el cupón %s en Odoo (%s) — '
                    . 'el código podría seguir activo, revisar.',
                    $code, $result['error'] ?? 'sin respuesta'
                ));
            }
        }
    }

    /** Firma del hook clásico: (order_id, posted_data, order). */
    public function consume_order_coupons_classic($order_id, $posted, $order): void {
        if ($order instanceof WC_Order) {
            $this->consume_order_coupons($order);
        }
    }

    /* ── Helpers ──────────────────────────────────────────────────────── */

    private function client(): ?Popolo_API_Client {
        $url = get_option('popolo_loyalty_odoo_url', '');
        $key = get_option('popolo_loyalty_api_key', '');
        if (!$url || !$key) {
            return null;
        }
        return new Popolo_API_Client($url, $key);
    }
}
