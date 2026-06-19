<?php
defined('ABSPATH') || exit;

class Popolo_API_Client {

    private string $base_url;
    private string $api_key;

    public function __construct(string $base_url, string $api_key) {
        $this->base_url = rtrim($base_url, '/');
        $this->api_key  = $api_key;
    }

    /**
     * Sync a WooCommerce order to Odoo.
     *
     * @param array $payload {
     *   order_id, phone, order_total, currency, source, trigger_status
     * }
     * @return array { success, http_code, body }
     */
    public function sync_order(array $payload): array {
        $url = $this->base_url . '/api/loyalty/sync-order';

        $response = wp_remote_post($url, [
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key'    => $this->api_key,
            ],
            'body' => wp_json_encode($payload),
        ]);

        if (is_wp_error($response)) {
            return [
                'success'   => false,
                'http_code' => 0,
                'body'      => ['error' => $response->get_error_message()],
            ];
        }

        $http_code = wp_remote_retrieve_response_code($response);
        $raw_body  = wp_remote_retrieve_body($response);
        $body      = json_decode($raw_body, true) ?? ['raw' => $raw_body];

        return [
            'success'   => $http_code === 200 && !empty($body['success']),
            'http_code' => $http_code,
            'body'      => $body,
        ];
    }

    /**
     * Test connectivity: calls Odoo /web/health.
     */
    public function test_connection(): array {
        $url = $this->base_url . '/web/health';

        $response = wp_remote_get($url, [
            'timeout' => 8,
            'headers' => ['X-API-Key' => $this->api_key],
        ]);

        if (is_wp_error($response)) {
            return ['ok' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        return [
            'ok'     => $code === 200,
            'status' => $code,
            'detail' => $body,
        ];
    }

    /**
     * Test sync key: sends a dry-run with a fake order id that won't match any partner.
     * Returns 404 (no_partner) on success, 401 if key is wrong.
     */
    public function test_api_key(): array {
        $url = $this->base_url . '/api/loyalty/sync-order';

        $response = wp_remote_post($url, [
            'timeout' => 8,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key'    => $this->api_key,
            ],
            'body' => wp_json_encode([
                'order_id'    => 'DRY_RUN_TEST',
                'phone'       => '000000000',
                'order_total' => 0,
                'source'      => 'woocommerce_test',
            ]),
        ]);

        if (is_wp_error($response)) {
            return ['ok' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        // 401 = bad key; 404/200/400 = key accepted, endpoint reached
        $key_ok = $code !== 401 && $code !== 503;

        return [
            'ok'      => $key_ok,
            'status'  => $code,
            'message' => $key_ok
                ? 'Clave API válida. Endpoint alcanzado.'
                : ($body['error'] ?? "HTTP {$code}"),
        ];
    }
}
