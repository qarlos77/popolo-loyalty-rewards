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
     * Sync a WooCommerce order to Odoo (matched by customer_email).
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
     * Fetch loyalty points for an email address (checkout display).
     */
    public function get_points_by_email(string $email): array {
        $url = $this->base_url . '/api/loyalty/points-by-email?' . http_build_query(['email' => $email]);

        $response = wp_remote_get($url, [
            'timeout' => 8,
            'headers' => ['X-API-Key' => $this->api_key],
        ]);

        if (is_wp_error($response)) {
            return ['found' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code !== 200) {
            return ['found' => false, 'error' => $body['error'] ?? "HTTP {$code}"];
        }

        return $body;
    }

    /**
     * Register a new loyalty member (standalone registration page).
     */
    public function register_loyalty(array $payload): array {
        $url = $this->base_url . '/api/loyalty/register';

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
                'success'            => false,
                'already_registered' => false,
                'http_code'          => 0,
                'body'               => ['error' => $response->get_error_message()],
            ];
        }

        $http_code = wp_remote_retrieve_response_code($response);
        $raw_body  = wp_remote_retrieve_body($response);
        $body      = json_decode($raw_body, true) ?? ['raw' => $raw_body];

        return [
            'success'            => $http_code === 200 && !empty($body['success']),
            'already_registered' => $http_code === 409 && !empty($body['already_registered']),
            'http_code'          => $http_code,
            'body'               => $body,
        ];
    }

    /**
     * Check birthday status for a customer email.
     */
    public function birthday_status(string $email): array {
        $url = $this->base_url . '/api/loyalty/birthday-status?' . http_build_query(['email' => $email]);

        $response = wp_remote_get($url, [
            'timeout' => 8,
            'headers' => ['X-API-Key' => $this->api_key],
        ]);

        if (is_wp_error($response)) {
            return ['error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code !== 200) {
            return ['error' => $body['error'] ?? "HTTP {$code}"];
        }
        return $body;
    }

    /**
     * Redeem birthday gift (in-store cashier action).
     */
    public function birthday_redeem(string $email, string $cashier = '', string $notes = ''): array {
        $url = $this->base_url . '/api/loyalty/birthday-redeem';

        $response = wp_remote_post($url, [
            'timeout' => 10,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key'    => $this->api_key,
            ],
            'body' => wp_json_encode([
                'email'   => $email,
                'cashier' => $cashier,
                'notes'   => $notes,
            ]),
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true) ?? [];

        return array_merge(['success' => $code === 200, 'http_code' => $code], $body);
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

        return ['ok' => $code === 200, 'status' => $code, 'detail' => $body];
    }

    /**
     * Verify API key: dry-run against sync-order endpoint.
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
                'order_id'       => 'DRY_RUN_TEST',
                'customer_email' => 'dryrun@test.invalid',
                'order_total'    => 0,
                'source'         => 'woocommerce_test',
            ]),
        ]);

        if (is_wp_error($response)) {
            return ['ok' => false, 'error' => $response->get_error_message()];
        }

        $code   = wp_remote_retrieve_response_code($response);
        $body   = json_decode(wp_remote_retrieve_body($response), true);
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
