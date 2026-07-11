<?php
defined('ABSPATH') || exit;

class Popolo_Order_Sync {

    private static ?self $instance = null;

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Hook into every WooCommerce order status transition
        add_action('woocommerce_order_status_changed', [$this, 'on_status_changed'], 10, 4);
    }

    /**
     * Called whenever a WooCommerce order changes status.
     *
     * @param int       $order_id
     * @param string    $from      Previous status slug (without 'wc-')
     * @param string    $to        New status slug (without 'wc-')
     * @param WC_Order  $order
     */
    public function on_status_changed(int $order_id, string $from, string $to, WC_Order $order): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }

        $trigger = get_option('popolo_loyalty_trigger_status', 'completed');

        // Support comma-separated list of trigger statuses
        $triggers = array_map('trim', explode(',', $trigger));

        if (!in_array($to, $triggers, true)) {
            return;
        }

        $this->sync_order($order, $to);
    }

    private function sync_order(WC_Order $order, string $trigger_status): void {
        global $wpdb;

        $order_id = $order->get_id();

        // Check if already successfully synced for this trigger status
        $already = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . POPOLO_LOYALTY_TABLE . "
             WHERE order_id = %d AND trigger_status = %s AND state = 'synced'
             LIMIT 1",
            $order_id,
            $trigger_status
        ));
        if ($already) {
            return; // Already synced — skip
        }

        $phone = $this->get_phone($order);

        // Log entry regardless of outcome
        $log_data = [
            'order_id'       => $order_id,
            'order_number'   => $order->get_order_number(),
            'phone'          => $phone,
            'order_total'    => $order->get_total(),
            'trigger_status' => $trigger_status,
            'state'          => 'pending',
            'synced_at'      => current_time('mysql'),
        ];

        if (empty($phone)) {
            $log_data['state']        = 'skipped';
            $log_data['odoo_response'] = json_encode(['error' => 'No phone number on order']);
            $wpdb->insert(POPOLO_LOYALTY_TABLE, $log_data);
            return;
        }

        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key', '');

        if (empty($odoo_url) || empty($api_key)) {
            $log_data['state']         = 'error';
            $log_data['odoo_response'] = json_encode(['error' => 'Plugin not configured (missing URL or API key)']);
            $wpdb->insert(POPOLO_LOYALTY_TABLE, $log_data);
            return;
        }

        $client  = new Popolo_API_Client($odoo_url, $api_key);
        $result  = $client->sync_order([
            'order_id'       => (string) $order_id,
            'phone'          => $phone,
            'order_total'    => (float) $order->get_total(),
            'currency'       => $order->get_currency(),
            // Multisede: cada subtienda tiene su propia numeración de pedidos —
            // sin un source distinto por sitio, el order_id 500 de Miraflores y
            // el 500 de Chacarilla chocarían en el detector de duplicados de Odoo
            'source'         => popolo_loyalty_source_slug(),
            'trigger_status' => $trigger_status,
            'customer_name'  => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
            'customer_email' => $order->get_billing_email(),
        ]);

        $body = $result['body'];

        if ($result['success']) {
            $log_data['state']          = 'synced';
            $log_data['points_awarded'] = (int) ($body['points_awarded'] ?? 0);
            $log_data['partner_name']   = $body['partner_name'] ?? '';
        } elseif (($result['http_code'] === 409) && !empty($body['duplicate'])) {
            $log_data['state']        = 'duplicate';
            $log_data['partner_name'] = $body['partner'] ?? '';
        } elseif ($result['http_code'] === 404) {
            $log_data['state'] = 'no_partner';
        } else {
            $log_data['state'] = 'error';
        }

        $log_data['odoo_response'] = json_encode($body);
        $wpdb->insert(POPOLO_LOYALTY_TABLE, $log_data);

        // Add order note in WooCommerce for visibility
        if ($result['success']) {
            $created_note = !empty($body['partner_created']) ? ' (contacto creado en Odoo)' : '';
            $order->add_order_note(sprintf(
                __('Popolo Loyalty: %d puntos otorgados a %s (total: %d pts)%s.', 'popolo-loyalty-sync'),
                $log_data['points_awarded'],
                $log_data['partner_name'],
                (int) ($body['total_points'] ?? 0),
                $created_note
            ));
        } elseif ($log_data['state'] === 'no_partner') {
            $order->add_order_note(sprintf(
                __('Popolo Loyalty: teléfono %s no encontrado en Odoo.', 'popolo-loyalty-sync'),
                $phone
            ));
        }
    }

    private function get_phone(WC_Order $order): string {
        $phone = $order->get_billing_phone();
        return preg_replace('/[\s\-\(\)\+]/', '', $phone ?? '');
    }

    /**
     * Manual retry: re-sync a single order from the WP admin log.
     */
    public static function retry(int $order_id, string $trigger_status = 'completed'): array {
        $order = wc_get_order($order_id);
        if (!$order) {
            return ['success' => false, 'error' => 'Order not found'];
        }

        $instance = self::get_instance();

        // Remove the existing failed log so it can retry
        global $wpdb;
        $wpdb->delete(POPOLO_LOYALTY_TABLE, [
            'order_id'       => $order_id,
            'trigger_status' => $trigger_status,
        ]);

        $instance->sync_order($order, $trigger_status);

        // Return what was logged
        $log = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . POPOLO_LOYALTY_TABLE . " WHERE order_id = %d ORDER BY id DESC LIMIT 1",
            $order_id
        ), ARRAY_A);

        return $log ?: ['success' => false, 'error' => 'No log entry created'];
    }
}
