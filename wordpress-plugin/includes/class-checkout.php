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
        add_action('wp_enqueue_scripts',                      [$this, 'enqueue_scripts']);
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_checkout_widgets']);
        add_action('woocommerce_checkout_create_order',       [$this, 'save_loyalty_meta'], 10, 2);
        add_action('woocommerce_thankyou',                    [$this, 'render_thankyou_widget']);
        add_action('wp_ajax_popolo_get_points',               [$this, 'ajax_get_points']);
        add_action('wp_ajax_nopriv_popolo_get_points',        [$this, 'ajax_get_points']);
    }

    public function enqueue_scripts(): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }
        if (!is_checkout() && !is_order_received_page()) {
            return;
        }

        wp_enqueue_script(
            'popolo-checkout',
            POPOLO_LOYALTY_PLUGIN_URL . 'includes/checkout.js',
            ['jquery'],
            POPOLO_LOYALTY_VERSION,
            true
        );

        wp_localize_script('popolo-checkout', 'popoloLoyalty', [
            'ajaxurl'       => admin_url('admin-ajax.php'),
            'nonce'         => wp_create_nonce('popolo_get_points'),
            'welcomePoints' => (int) get_option('popolo_loyalty_welcome_points', 10),
        ]);
    }

    public function render_checkout_widgets(): void {
        ?>
        <div id="popolo-points-widget" style="display:none;margin-bottom:12px;" class="woocommerce-info"></div>
        <div id="popolo-enrollment-widget" style="display:none;margin-bottom:12px;padding:12px 16px;" class="woocommerce-info">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:normal;margin:0;">
                <input type="checkbox" id="popolo_join_loyalty_checkbox" style="width:auto;margin:0;flex-shrink:0;">
                <span id="popolo-enrollment-text"></span>
            </label>
        </div>
        <input type="hidden" name="popolo_join_loyalty" id="popolo_join_loyalty" value="">
        <?php
    }

    public function save_loyalty_meta(WC_Order $order, array $data): void {
        if (!empty($_POST['popolo_join_loyalty']) && $_POST['popolo_join_loyalty'] === '1') {
            $order->update_meta_data('_popolo_join_loyalty', '1');
        }
    }

    public function render_thankyou_widget(int $order_id): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        $email = $order->get_billing_email();
        if (!$email) {
            return;
        }
        ?>
        <div id="popolo-thankyou-points"
             data-email="<?= esc_attr($email) ?>"
             style="display:none;"
             class="woocommerce-message">
        </div>
        <?php
    }

    public function ajax_get_points(): void {
        check_ajax_referer('popolo_get_points');

        $email = sanitize_email($_POST['email'] ?? '');
        if (!is_email($email)) {
            wp_send_json(['found' => false, 'has_card' => false]);
        }

        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key', '');

        if (empty($odoo_url) || empty($api_key)) {
            wp_send_json(['found' => false, 'has_card' => false]);
        }

        $client = new Popolo_API_Client($odoo_url, $api_key);
        $data   = $client->get_points_by_email($email);

        // Ensure has_card is present (Odoo returns it since latest update)
        if (!isset($data['has_card'])) {
            $data['has_card'] = !empty($data['found']) && !empty($data['cards']);
        }

        wp_send_json($data);
    }
}
