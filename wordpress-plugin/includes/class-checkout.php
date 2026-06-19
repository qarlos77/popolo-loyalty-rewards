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
        add_action('woocommerce_after_checkout_billing_form', [$this, 'render_points_widget']);
        add_action('wp_ajax_popolo_get_points',               [$this, 'ajax_get_points']);
        add_action('wp_ajax_nopriv_popolo_get_points',        [$this, 'ajax_get_points']);
    }

    public function enqueue_scripts(): void {
        if (!is_checkout() || !get_option('popolo_loyalty_enabled', '1')) {
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
            'ajaxurl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('popolo_get_points'),
        ]);
    }

    public function render_points_widget(): void {
        echo '<div id="popolo-points-widget" style="display:none;margin-bottom:12px;" class="woocommerce-info"></div>';
    }

    public function ajax_get_points(): void {
        check_ajax_referer('popolo_get_points');

        $email = sanitize_email($_POST['email'] ?? '');
        if (!is_email($email)) {
            wp_send_json(['found' => false]);
        }

        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key', '');

        if (empty($odoo_url) || empty($api_key)) {
            wp_send_json(['found' => false]);
        }

        $client = new Popolo_API_Client($odoo_url, $api_key);
        wp_send_json($client->get_points_by_email($email));
    }
}
