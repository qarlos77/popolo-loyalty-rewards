<?php
defined('ABSPATH') || exit;

class Popolo_Checkout {

    private static ?self $instance = null;

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Block checkout: additional fields
        add_action('woocommerce_init', [$this, 'register_block_fields']);

        // Capture block checkout data from request (more reliable than order meta)
        add_action('woocommerce_store_api_checkout_update_order_from_request',
            [$this, 'capture_block_data'], 10, 2);

        // Sync to Odoo after block order is fully processed
        add_action('woocommerce_store_api_checkout_order_processed',
            [$this, 'on_block_order_processed'], 20);

        // My-Account registration fields (classic form)
        add_action('woocommerce_register_form',  [$this, 'render_register_doc_fields']);
        add_action('woocommerce_register_post',  [$this, 'validate_register_doc_fields'], 10, 3);

        // Customer created — My-Account or block checkout
        add_action('woocommerce_created_customer', [$this, 'on_customer_created'], 10);

        // Hide postal code and company; default state to Lima
        add_filter('woocommerce_get_country_locale',        [$this, 'adjust_address_locale']);
        add_filter('woocommerce_default_address_fields',    [$this, 'adjust_address_defaults']);
        add_filter('woocommerce_customer_default_location', [$this, 'default_lima_state']);

        // Scripts & styles
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);

        // Global points badge in footer (logged-in users, all pages)
        add_action('wp_footer', [$this, 'render_points_badge']);

        // AJAX
        add_action('wp_ajax_popolo_get_points',        [$this, 'ajax_get_points']);
        add_action('wp_ajax_nopriv_popolo_get_points', [$this, 'ajax_get_points']);
    }

    /* ── Block checkout: register additional fields ────────────────────── */

    public function register_block_fields(): void {
        if (!function_exists('woocommerce_register_additional_checkout_field')) {
            return;
        }

        woocommerce_register_additional_checkout_field([
            'id'                => 'popolo-loyalty/doc-type',
            'label'             => 'Tipo de documento',
            'location'          => 'contact',
            'type'              => 'select',
            'options'           => [
                ['value' => '',          'label' => 'Seleccionar tipo'],
                ['value' => 'DNI',       'label' => 'DNI'],
                ['value' => 'CE',        'label' => 'C.E.'],
                ['value' => 'Pasaporte', 'label' => 'Pasaporte'],
            ],
            'required'          => true,
            'validate_callback' => function ($value) {
                if (empty($value)) {
                    return new WP_Error('doc_type_required', 'Por favor selecciona el tipo de documento.');
                }
                return in_array($value, ['DNI', 'CE', 'Pasaporte'], true)
                    ? true
                    : new WP_Error('invalid_doc_type', 'Tipo de documento no válido.');
            },
        ]);

        woocommerce_register_additional_checkout_field([
            'id'                => 'popolo-loyalty/doc-number',
            'label'             => 'Número de documento',
            'location'          => 'contact',
            'type'              => 'text',
            'required'          => true,
            'validate_callback' => function ($value) {
                if (empty(trim($value))) {
                    return new WP_Error('doc_number_required', 'Por favor ingresa tu número de documento.');
                }
                return true;
            },
        ]);

        woocommerce_register_additional_checkout_field([
            'id'                => 'popolo-loyalty/birth-date',
            'label'             => 'Fecha de nacimiento',
            'location'          => 'contact',
            'type'              => 'text',
            'required'          => false,
            'attributes'        => ['type' => 'date'],
            'validate_callback' => function ($value) {
                if (empty($value)) return true;
                $d = DateTime::createFromFormat('Y-m-d', $value);
                return ($d && $d->format('Y-m-d') === $value)
                    ? true
                    : new WP_Error('invalid_birth_date', 'Fecha de nacimiento no válida (usa AAAA-MM-DD).');
            },
        ]);
    }

    /* ── Capture block checkout data from request ─────────────────────── */

    /**
     * Fires with both $order and $request during Store API checkout.
     * Reads additional fields directly from the JSON body — more reliable
     * than reading from order meta in the processed hook.
     */
    public function capture_block_data(WC_Order $order, WP_REST_Request $request): void {
        $body    = (array) ($request->get_json_params() ?: []);
        $billing = (array) ($body['billing_address'] ?? []);

        // WC blocks may nest contact fields inside billing_address or at top level
        $doc_type   = sanitize_text_field($billing['popolo-loyalty/doc-type']   ?? $body['popolo-loyalty/doc-type']   ?? '');
        $doc_number = sanitize_text_field($billing['popolo-loyalty/doc-number'] ?? $body['popolo-loyalty/doc-number'] ?? '');
        $birth_date = sanitize_text_field($billing['popolo-loyalty/birth-date'] ?? $body['popolo-loyalty/birth-date'] ?? '');

        // Store under simple private meta keys for use in on_block_order_processed
        if ($doc_type)   $order->update_meta_data('_popolo_doc_type',   $doc_type);
        if ($doc_number) $order->update_meta_data('_popolo_doc_number', $doc_number);
        if ($birth_date) $order->update_meta_data('_popolo_birth_date', $birth_date);
    }

    /* ── Customer created ─────────────────────────────────────────────── */

    public function on_customer_created(int $customer_id): void {
        // My-Account classic form populates $_POST
        $type       = sanitize_text_field($_POST['reg_doc_type']   ?? '');
        $number     = sanitize_text_field($_POST['reg_doc_number'] ?? '');
        $birth_date = sanitize_text_field($_POST['reg_birth_date'] ?? '');

        if ($type || $number || $birth_date) {
            if ($type)       update_user_meta($customer_id, 'billing_doc_type',   $type);
            if ($number)     update_user_meta($customer_id, 'billing_doc_number', $number);
            if ($birth_date) update_user_meta($customer_id, 'billing_birth_date', $birth_date);
            $this->do_sync_to_odoo($customer_id, $type, $number, $birth_date);
        } else {
            // Block checkout: data arrives with the order
            update_user_meta($customer_id, '_popolo_new_registration', '1');
        }
    }

    /* ── Block checkout: order processed ──────────────────────────────── */

    public function on_block_order_processed(WC_Order $order): void {
        $customer_id = $order->get_customer_id();
        if (!$customer_id) {
            return;
        }

        // Read doc/birthday from meta set in capture_block_data
        // Fall back to reading directly from order meta (WC additional fields API)
        $doc_type   = (string) ($order->get_meta('_popolo_doc_type')   ?: $order->get_meta('popolo-loyalty/doc-type')   ?: '');
        $doc_number = (string) ($order->get_meta('_popolo_doc_number') ?: $order->get_meta('popolo-loyalty/doc-number') ?: '');
        $birth_date = (string) ($order->get_meta('_popolo_birth_date') ?: $order->get_meta('popolo-loyalty/birth-date') ?: '');

        // Persist to user meta
        if ($doc_type)   update_user_meta($customer_id, 'billing_doc_type',   $doc_type);
        if ($doc_number) update_user_meta($customer_id, 'billing_doc_number', $doc_number);
        if ($birth_date) update_user_meta($customer_id, 'billing_birth_date', $birth_date);

        // Only sync to Odoo for newly registered customers
        $is_new = get_user_meta($customer_id, '_popolo_new_registration', true);
        if (!$is_new) {
            return;
        }
        delete_user_meta($customer_id, '_popolo_new_registration');

        // Build address from the order (freshly submitted billing data)
        $address = [
            'street'       => $order->get_billing_address_1(),
            'street2'      => $order->get_billing_address_2(),
            'city'         => $order->get_billing_city(),
            'state_code'   => $order->get_billing_state(),
            'country_code' => $order->get_billing_country() ?: 'PE',
        ];

        $this->do_sync_to_odoo($customer_id, $doc_type, $doc_number, $birth_date, $address);
    }

    /* ── My-Account registration fields ───────────────────────────────── */

    public function render_register_doc_fields(): void {
        ?>
        <p class="woocommerce-form-row woocommerce-form-row--first form-row form-row-first">
            <label for="reg_doc_type">Tipo de documento <span class="optional">(opcional)</span></label>
            <select name="reg_doc_type" id="reg_doc_type" class="woocommerce-Input">
                <option value="">Seleccionar tipo</option>
                <option value="DNI">DNI</option>
                <option value="CE">C.E.</option>
                <option value="Pasaporte">Pasaporte</option>
            </select>
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--last form-row form-row-last">
            <label for="reg_doc_number">Número de documento <span class="optional">(opcional)</span></label>
            <input type="text" name="reg_doc_number" id="reg_doc_number"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   maxlength="20" value="">
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_birth_date">Fecha de nacimiento <span class="optional">(opcional)</span></label>
            <input type="date" name="reg_birth_date" id="reg_birth_date"
                   class="woocommerce-Input woocommerce-Input--text input-text" value="">
        </p>
        <div class="clear"></div>
        <?php
    }

    public function validate_register_doc_fields(string $username, string $email, WP_Error $errors): void {
        $type   = sanitize_text_field($_POST['reg_doc_type']   ?? '');
        $number = sanitize_text_field($_POST['reg_doc_number'] ?? '');
        if ($type && !$number) {
            $errors->add('reg_doc_number_empty', 'Por favor ingresa el número de documento.');
        }
        if ($number && !$type) {
            $errors->add('reg_doc_type_empty', 'Por favor selecciona el tipo de documento.');
        }
    }

    /* ── Odoo sync ────────────────────────────────────────────────────── */

    private function do_sync_to_odoo(
        int    $customer_id,
        string $doc_type   = '',
        string $doc_number = '',
        string $birth_date = '',
        array  $address    = []
    ): void {
        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key',  '');
        if (empty($odoo_url) || empty($api_key)) {
            return;
        }

        $user  = get_userdata($customer_id);
        $fname = get_user_meta($customer_id, 'billing_first_name', true);
        $lname = get_user_meta($customer_id, 'billing_last_name',  true);
        $name  = trim("$fname $lname") ?: ($user->display_name ?: $user->user_email);
        $phone = get_user_meta($customer_id, 'billing_phone', true);

        $payload = [
            'email'        => $user->user_email,
            'name'         => $name,
            'phone'        => $phone      ?: '',
            'doc_type'     => $doc_type   ?: '',
            'doc_number'   => $doc_number ?: '',
            'birth_date'   => $birth_date ?: '',
            'street'       => $address['street']       ?? '',
            'street2'      => $address['street2']      ?? '',
            'city'         => $address['city']         ?? '',
            'state_code'   => $address['state_code']   ?? '',
            'country_code' => $address['country_code'] ?? 'PE',
        ];

        $client = new Popolo_API_Client($odoo_url, $api_key);
        $client->register_customer($payload);
    }

    /* ── Address field adjustments ────────────────────────────────────── */

    public function adjust_address_locale(array $locale): array {
        $locale['PE']['postcode'] = ['required' => false, 'hidden' => true];
        $locale['PE']['company']  = ['required' => false, 'hidden' => true];
        return $locale;
    }

    public function adjust_address_defaults(array $fields): array {
        $fields['postcode']['required'] = false;
        $fields['postcode']['hidden']   = true;
        $fields['company']['required']  = false;
        $fields['company']['hidden']    = true;
        return $fields;
    }

    public function default_lima_state(array $location): array {
        if (($location['country'] ?? '') === 'PE' && empty($location['state'])) {
            $location['state'] = 'LIM';
        }
        return $location;
    }

    /* ── Scripts & styles ─────────────────────────────────────────────── */

    public function enqueue_scripts(): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }

        $logged_in     = is_user_logged_in();
        $on_checkout   = is_checkout() && !is_order_received_page();
        $on_order_rcvd = is_order_received_page();

        if ($on_checkout || $on_order_rcvd) {
            wp_enqueue_script(
                'popolo-checkout',
                POPOLO_LOYALTY_PLUGIN_URL . 'includes/checkout.js',
                ['jquery'],
                POPOLO_LOYALTY_VERSION,
                true
            );

            $cart_total    = ($on_checkout && WC()->cart) ? floatval(WC()->cart->get_total('edit')) : 0;
            $current_email = $logged_in ? wp_get_current_user()->user_email : '';

            wp_localize_script('popolo-checkout', 'popoloLoyalty', [
                'ajaxurl'      => admin_url('admin-ajax.php'),
                'nonce'        => wp_create_nonce('popolo_get_points'),
                'cartTotal'    => $cart_total,
                'currentEmail' => $current_email,
                'userLoggedIn' => $logged_in,
            ]);
        }

        if ($logged_in) {
            wp_enqueue_script(
                'popolo-loyalty-header',
                POPOLO_LOYALTY_PLUGIN_URL . 'includes/loyalty-header.js',
                ['jquery'],
                POPOLO_LOYALTY_VERSION,
                true
            );
            wp_enqueue_style(
                'popolo-loyalty-frontend',
                POPOLO_LOYALTY_PLUGIN_URL . 'includes/loyalty-frontend.css',
                [],
                POPOLO_LOYALTY_VERSION
            );
            wp_localize_script('popolo-loyalty-header', 'popoloBadge', [
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce'   => wp_create_nonce('popolo_get_points'),
                'email'   => wp_get_current_user()->user_email,
            ]);
        }
    }

    /* ── Badge ────────────────────────────────────────────────────────── */

    public function render_points_badge(): void {
        if (!is_user_logged_in() || !get_option('popolo_loyalty_enabled', '1')) {
            return;
        }
        ?>
        <div id="popolo-points-badge" style="display:none;" role="status" aria-live="polite">
            <span class="popolo-badge-icon">🎁</span>
            <span id="popolo-badge-pts">…</span>
            <span class="popolo-badge-label">pts</span>
        </div>
        <?php
    }

    /* ── AJAX ─────────────────────────────────────────────────────────── */

    public function ajax_get_points(): void {
        check_ajax_referer('popolo_get_points');

        $email = sanitize_email($_POST['email'] ?? '');
        if (!is_email($email)) {
            wp_send_json(['found' => false, 'has_card' => false]);
        }

        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key',  '');
        if (empty($odoo_url) || empty($api_key)) {
            wp_send_json(['found' => false, 'has_card' => false]);
        }

        $client = new Popolo_API_Client($odoo_url, $api_key);
        $data   = $client->get_points_by_email($email);

        if (!isset($data['has_card'])) {
            $data['has_card'] = !empty($data['found']) && !empty($data['cards']);
        }

        wp_send_json($data);
    }
}
