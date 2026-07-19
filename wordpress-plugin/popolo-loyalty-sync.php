<?php
/**
 * Plugin Name: Popolo Loyalty Sync
 * Plugin URI:  https://popolopizza.com
 * Description: Sincroniza puntos de lealtad con Odoo cuando un pedido de WooCommerce alcanza el estado configurado.
 * Version:     1.8.8
 * Author:      PopoloPizza
 * Text Domain: popolo-loyalty-sync
 * Requires Plugins: woocommerce
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

defined('ABSPATH') || exit;

define('POPOLO_LOYALTY_VERSION', '1.8.8');
define('POPOLO_LOYALTY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('POPOLO_LOYALTY_PLUGIN_URL', plugin_dir_url(__FILE__));
define('POPOLO_LOYALTY_TABLE',      $GLOBALS['wpdb']->prefix . 'popolo_loyalty_log');

/* ── Autoload classes ─────────────────────────────────────────────────────── */
require_once POPOLO_LOYALTY_PLUGIN_DIR . 'includes/class-api-client.php';
require_once POPOLO_LOYALTY_PLUGIN_DIR . 'includes/class-order-sync.php';
require_once POPOLO_LOYALTY_PLUGIN_DIR . 'includes/class-checkout.php';
require_once POPOLO_LOYALTY_PLUGIN_DIR . 'includes/class-coupon-bridge.php';
require_once POPOLO_LOYALTY_PLUGIN_DIR . 'admin/class-admin.php';

/**
 * Identificador de origen para Odoo, distinto por subtienda del multisite:
 * el sitio principal conserva 'woocommerce' (continuidad con el historial de
 * sync ya registrado en Odoo); las sedes usan 'woocommerce-{subdominio}'.
 */
function popolo_loyalty_source_slug(): string {
    if (!is_multisite() || is_main_site()) {
        return 'woocommerce';
    }
    $host  = wp_parse_url(home_url(), PHP_URL_HOST) ?: '';
    $label = explode('.', $host)[0] ?: 'site' . get_current_blog_id();
    return 'woocommerce-' . sanitize_key($label);
}

/* ── Activation: create log table ────────────────────────────────────────── */
register_activation_hook(__FILE__, 'popolo_loyalty_activate');
function popolo_loyalty_activate() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    $table   = POPOLO_LOYALTY_TABLE;

    $sql = "CREATE TABLE IF NOT EXISTS {$table} (
        id             BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id       BIGINT(20) UNSIGNED NOT NULL,
        order_number   VARCHAR(50)         NOT NULL DEFAULT '',
        phone          VARCHAR(50)         NOT NULL DEFAULT '',
        order_total    DECIMAL(10,2)       NOT NULL DEFAULT 0,
        trigger_status VARCHAR(30)         NOT NULL DEFAULT '',
        state          VARCHAR(20)         NOT NULL DEFAULT 'pending',
        points_awarded INT(11)             NOT NULL DEFAULT 0,
        partner_name   VARCHAR(255)        NOT NULL DEFAULT '',
        odoo_response  TEXT,
        synced_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY order_id (order_id),
        KEY state (state)
    ) {$charset};";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);

    // Set default options
    add_option('popolo_loyalty_odoo_url',       '');
    add_option('popolo_loyalty_api_key',        '');
    add_option('popolo_loyalty_trigger_status', 'completed');
    add_option('popolo_loyalty_enabled',        '1');
}

/* ── Deactivation ────────────────────────────────────────────────────────── */
register_deactivation_hook(__FILE__, 'popolo_loyalty_deactivate');
function popolo_loyalty_deactivate() {
    // Keep data and settings on deactivation; only remove on uninstall
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
add_action('plugins_loaded', 'popolo_loyalty_init');
function popolo_loyalty_init() {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p><strong>Popolo Loyalty Sync</strong> requiere WooCommerce activo.</p></div>';
        });
        return;
    }

    Popolo_Order_Sync::get_instance();
    Popolo_Checkout::get_instance();
    Popolo_Coupon_Bridge::get_instance();

    if (is_admin()) {
        Popolo_Admin::get_instance();
    }
}
