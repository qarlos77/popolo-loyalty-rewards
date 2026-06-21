<?php
defined('ABSPATH') || exit;

class Popolo_Checkout {

    private static ?self $instance = null;

    const DOC_TYPES = [
        ''          => 'Seleccionar tipo',
        'DNI'       => 'DNI',
        'CE'        => 'C.E.',
        'Pasaporte' => 'Pasaporte',
    ];

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Scripts & styles
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);

        // Billing document fields (checkout)
        add_filter('woocommerce_billing_fields',   [$this, 'add_billing_doc_fields']);
        add_action('woocommerce_checkout_process',  [$this, 'validate_checkout_doc_fields']);

        // My-Account registration form doc fields
        add_action('woocommerce_register_form',    [$this, 'render_register_doc_fields']);
        add_action('woocommerce_register_post',    [$this, 'validate_register_doc_fields'], 10, 3);

        // Enable "create account" option at checkout
        add_filter('woocommerce_checkout_registration_enabled', '__return_true');

        // Save on checkout order creation
        add_action('woocommerce_checkout_create_order', [$this, 'save_order_meta'], 10, 2);

        // Save doc fields + sync to Odoo when WC user is created
        add_action('woocommerce_created_customer', [$this, 'save_customer_doc_meta']);
        add_action('woocommerce_created_customer', [$this, 'sync_customer_to_odoo'], 20);

        // Checkout widgets (points / enrollment)
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_checkout_widgets']);
        add_action('woocommerce_thankyou',                    [$this, 'render_thankyou_widget']);

        // Global points badge rendered in footer (logged-in users)
        add_action('wp_footer', [$this, 'render_points_badge']);

        // AJAX
        add_action('wp_ajax_popolo_get_points',        [$this, 'ajax_get_points']);
        add_action('wp_ajax_nopriv_popolo_get_points', [$this, 'ajax_get_points']);
    }

    /* ── Scripts & styles ────────────────────────────────────────────── */
    public function enqueue_scripts(): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }

        $on_checkout   = is_checkout() && !is_order_received_page();
        $on_order_rcvd = is_order_received_page();
        $logged_in     = is_user_logged_in();

        // Checkout + order-received: full widget script
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

        // Global badge: all pages, logged-in users only
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

    /* ── Billing document fields ─────────────────────────────────────── */
    public function add_billing_doc_fields(array $fields): array {
        $user_id    = get_current_user_id();
        $saved_type = $user_id ? get_user_meta($user_id, 'billing_doc_type',   true) : '';
        $saved_num  = $user_id ? get_user_meta($user_id, 'billing_doc_number', true) : '';

        $fields['billing_doc_type'] = [
            'label'    => 'Tipo de documento',
            'type'     => 'select',
            'class'    => ['form-row-first'],
            'options'  => self::DOC_TYPES,
            'default'  => $saved_type,
            'required' => false,
            'priority' => 120,
        ];
        $fields['billing_doc_number'] = [
            'label'       => 'Número de documento',
            'type'        => 'text',
            'class'       => ['form-row-last'],
            'default'     => $saved_num,
            'required'    => false,
            'priority'    => 121,
            'maxlength'   => 20,
            'description' => 'Necesario para acumular puntos de lealtad',
        ];
        return $fields;
    }

    public function validate_checkout_doc_fields(): void {
        $type   = sanitize_text_field($_POST['billing_doc_type']   ?? '');
        $number = sanitize_text_field($_POST['billing_doc_number'] ?? '');
        if ($type && !$number) {
            wc_add_notice('Por favor ingresa el número de documento.', 'error');
        }
        if ($number && !$type) {
            wc_add_notice('Por favor selecciona el tipo de documento.', 'error');
        }
    }

    /* ── My-Account registration doc fields ─────────────────────────── */
    public function render_register_doc_fields(): void {
        ?>
        <p class="woocommerce-form-row woocommerce-form-row--first form-row form-row-first">
            <label for="reg_doc_type">Tipo de documento <span class="optional">(opcional)</span></label>
            <select name="reg_doc_type" id="reg_doc_type" class="woocommerce-Input">
                <?php foreach (self::DOC_TYPES as $val => $label): ?>
                    <option value="<?= esc_attr($val) ?>"><?= esc_html($label) ?></option>
                <?php endforeach; ?>
            </select>
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--last form-row form-row-last">
            <label for="reg_doc_number">Número de documento <span class="optional">(opcional)</span></label>
            <input type="text" name="reg_doc_number" id="reg_doc_number"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   maxlength="20" value="">
            <span class="description">Para acumular puntos de lealtad</span>
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

    /* ── Save ────────────────────────────────────────────────────────── */
    public function save_order_meta(WC_Order $order, array $data): void {
        if (!empty($_POST['popolo_join_loyalty']) && $_POST['popolo_join_loyalty'] === '1') {
            $order->update_meta_data('_popolo_join_loyalty', '1');
        }

        $type   = sanitize_text_field($_POST['billing_doc_type']   ?? '');
        $number = sanitize_text_field($_POST['billing_doc_number'] ?? '');

        if ($type)   $order->update_meta_data('_billing_doc_type',   $type);
        if ($number) $order->update_meta_data('_billing_doc_number', $number);

        // Persist to user meta when logged in
        $customer_id = $order->get_customer_id();
        if ($customer_id) {
            if ($type)   update_user_meta($customer_id, 'billing_doc_type',   $type);
            if ($number) update_user_meta($customer_id, 'billing_doc_number', $number);
        }
    }

    public function save_customer_doc_meta(int $customer_id): void {
        // Checkout registration uses billing_* fields; My-Account uses reg_* fields
        $type   = sanitize_text_field($_POST['billing_doc_type']   ?? $_POST['reg_doc_type']   ?? '');
        $number = sanitize_text_field($_POST['billing_doc_number'] ?? $_POST['reg_doc_number'] ?? '');

        if ($type)   update_user_meta($customer_id, 'billing_doc_type',   $type);
        if ($number) update_user_meta($customer_id, 'billing_doc_number', $number);
    }

    public function sync_customer_to_odoo(int $customer_id): void {
        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key',  '');
        if (empty($odoo_url) || empty($api_key)) return;

        $user   = get_userdata($customer_id);
        $fname  = get_user_meta($customer_id, 'billing_first_name', true);
        $lname  = get_user_meta($customer_id, 'billing_last_name',  true);
        $name   = trim("$fname $lname") ?: ($user->display_name ?: $user->user_email);
        $phone  = get_user_meta($customer_id, 'billing_phone',      true);
        $type   = get_user_meta($customer_id, 'billing_doc_type',   true);
        $number = get_user_meta($customer_id, 'billing_doc_number', true);

        $client = new Popolo_API_Client($odoo_url, $api_key);
        $client->register_customer([
            'email'      => $user->user_email,
            'name'       => $name,
            'phone'      => $phone  ?: '',
            'doc_type'   => $type   ?: '',
            'doc_number' => $number ?: '',
        ]);
    }

    /* ── Checkout widgets ────────────────────────────────────────────── */
    public function render_checkout_widgets(): void {
        ?>
        <div id="popolo-points-widget" style="display:none;margin:12px 0;" class="woocommerce-info"></div>
        <div id="popolo-enrollment-widget" style="display:none;margin:12px 0;padding:12px 16px;" class="woocommerce-info">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:normal;margin:0;">
                <input type="checkbox" id="popolo_join_loyalty_checkbox" style="width:auto;margin:0;flex-shrink:0;">
                <span id="popolo-enrollment-text">Unirme al programa de lealtad y ganar puntos con esta compra</span>
            </label>
        </div>
        <input type="hidden" name="popolo_join_loyalty" id="popolo_join_loyalty" value="">
        <?php
    }

    public function render_thankyou_widget(int $order_id): void {
        if (!get_option('popolo_loyalty_enabled', '1')) return;
        $order = wc_get_order($order_id);
        if (!$order) return;
        $email = $order->get_billing_email();
        if (!$email) return;
        ?>
        <div id="popolo-thankyou-points"
             data-email="<?= esc_attr($email) ?>"
             style="display:none;"
             class="woocommerce-message">
        </div>
        <?php
    }

    /* ── Global points badge ─────────────────────────────────────────── */
    public function render_points_badge(): void {
        if (!is_user_logged_in() || !get_option('popolo_loyalty_enabled', '1')) return;
        ?>
        <div id="popolo-points-badge" style="display:none;" role="status" aria-live="polite">
            <span class="popolo-badge-icon">🎁</span>
            <span id="popolo-badge-pts">…</span>
            <span class="popolo-badge-label">pts</span>
        </div>
        <?php
    }

    /* ── AJAX ────────────────────────────────────────────────────────── */
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
