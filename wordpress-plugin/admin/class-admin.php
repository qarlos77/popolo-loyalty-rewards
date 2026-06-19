<?php
defined('ABSPATH') || exit;

class Popolo_Admin {

    private static ?self $instance = null;

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu',            [$this, 'add_menu']);
        add_action('admin_init',            [$this, 'register_settings']);
        add_action('wp_ajax_popolo_test',   [$this, 'ajax_test']);
        add_action('wp_ajax_popolo_retry',  [$this, 'ajax_retry']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    /* ── Menu ─────────────────────────────────────────────────────────── */
    public function add_menu(): void {
        add_submenu_page(
            'woocommerce',
            'Popolo Loyalty Sync',
            'Loyalty Sync',
            'manage_woocommerce',
            'popolo-loyalty-sync',
            [$this, 'render_settings_page']
        );
        add_submenu_page(
            'woocommerce',
            'Loyalty — Log de Sincronización',
            'Loyalty Log',
            'manage_woocommerce',
            'popolo-loyalty-log',
            [$this, 'render_log_page']
        );
    }

    /* ── Settings ─────────────────────────────────────────────────────── */
    public function register_settings(): void {
        register_setting('popolo_loyalty_group', 'popolo_loyalty_odoo_url',      ['sanitize_callback' => 'esc_url_raw']);
        register_setting('popolo_loyalty_group', 'popolo_loyalty_api_key',       ['sanitize_callback' => 'sanitize_text_field']);
        register_setting('popolo_loyalty_group', 'popolo_loyalty_trigger_status',['sanitize_callback' => 'sanitize_text_field']);
        register_setting('popolo_loyalty_group', 'popolo_loyalty_enabled',       ['sanitize_callback' => 'absint']);
        register_setting('popolo_loyalty_group', 'popolo_loyalty_phone_field',   ['sanitize_callback' => 'sanitize_text_field']);
    }

    /* ── Assets ───────────────────────────────────────────────────────── */
    public function enqueue_assets(string $hook): void {
        if (!in_array($hook, ['woocommerce_page_popolo-loyalty-sync', 'woocommerce_page_popolo-loyalty-log'], true)) {
            return;
        }
        wp_enqueue_style('popolo-loyalty-admin', POPOLO_LOYALTY_PLUGIN_URL . 'admin/admin.css', [], POPOLO_LOYALTY_VERSION);
    }

    /* ── Settings page ────────────────────────────────────────────────── */
    public function render_settings_page(): void {
        $odoo_url       = esc_attr(get_option('popolo_loyalty_odoo_url',       ''));
        $api_key        = esc_attr(get_option('popolo_loyalty_api_key',         ''));
        $trigger        = esc_attr(get_option('popolo_loyalty_trigger_status', 'completed'));
        $enabled        = get_option('popolo_loyalty_enabled', '1') ? 'checked' : '';
        $phone_field    = get_option('popolo_loyalty_phone_field', 'billing_phone');
        $nonce          = wp_create_nonce('popolo_loyalty_test');
        ?>
        <div class="wrap popolo-wrap">
            <h1>Popolo Loyalty Sync <span class="version">v<?= POPOLO_LOYALTY_VERSION ?></span></h1>

            <!-- Connection test bar -->
            <div class="popolo-test-bar">
                <button type="button" id="popolo-test-btn" class="button button-secondary">
                    Probar conexión y clave API
                </button>
                <span id="popolo-test-result"></span>
            </div>

            <form method="post" action="options.php">
                <?php settings_fields('popolo_loyalty_group'); ?>

                <table class="form-table">
                    <tr>
                        <th>Habilitado</th>
                        <td>
                            <label>
                                <input type="checkbox" name="popolo_loyalty_enabled" value="1" <?= $enabled ?>>
                                Activar sincronización automática con Odoo
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="popolo_odoo_url">URL de Odoo</label></th>
                        <td>
                            <input type="url" id="popolo_odoo_url" name="popolo_loyalty_odoo_url"
                                   value="<?= $odoo_url ?>" class="regular-text"
                                   placeholder="https://sistema.tupizza.com" required>
                            <p class="description">Sin barra final. Ejemplo: <code>https://sistema.popolopizza.com</code></p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="popolo_api_key">API Key</label></th>
                        <td>
                            <input type="password" id="popolo_api_key" name="popolo_loyalty_api_key"
                                   value="<?= $api_key ?>" class="regular-text" autocomplete="off">
                            <p class="description">
                                Configura esta misma clave en Odoo → Ajustes → <em>Loyalty Rewards API → Sync API Key</em>.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="popolo_trigger">Estado que dispara el sync</label></th>
                        <td>
                            <select id="popolo_trigger" name="popolo_loyalty_trigger_status">
                                <option value="completed" <?= selected($trigger, 'completed', false) ?>>
                                    Completado (completed) — recomendado
                                </option>
                                <option value="processing" <?= selected($trigger, 'processing', false) ?>>
                                    En proceso / Pagado (processing)
                                </option>
                                <option value="processing,completed" <?= selected($trigger, 'processing,completed', false) ?>>
                                    Ambos (processing y completed) — una sola vez por orden
                                </option>
                            </select>
                            <p class="description">
                                <strong>Ambos</strong> sincronizará la primera vez que la orden llegue a cualquiera de los dos estados.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="popolo_phone_field">Campo de teléfono</label></th>
                        <td>
                            <select id="popolo_phone_field" name="popolo_loyalty_phone_field">
                                <option value="billing_phone" <?= selected($phone_field, 'billing_phone', false) ?>>
                                    Teléfono de facturación (billing_phone)
                                </option>
                                <option value="shipping_phone" <?= selected($phone_field, 'shipping_phone', false) ?>>
                                    Teléfono de envío (shipping_phone)
                                </option>
                            </select>
                        </td>
                    </tr>
                </table>

                <?php submit_button('Guardar configuración'); ?>
            </form>

            <hr>
            <h2>Cómo funciona</h2>
            <ol>
                <li>Instala este plugin en WordPress y configura la URL de Odoo + API Key.</li>
                <li>En Odoo ve a <strong>Ajustes → Loyalty Rewards API</strong> y:
                    <ul>
                        <li>Ingresa la <em>misma</em> API Key en el campo <em>Sync API Key</em>.</li>
                        <li>Configura los puntos por unidad de moneda (ej. <code>0.10</code> = 1 pto por cada S/.10).</li>
                    </ul>
                </li>
                <li>Cuando una orden de WooCommerce alcance el estado configurado, el plugin enviará automáticamente
                    la orden a Odoo para que se acrediten los puntos al contacto con el mismo número de teléfono.</li>
                <li>Si el cliente no existe en Odoo, la orden queda registrada como <em>sin contacto</em>.
                    Crea el contacto en Odoo con el mismo número y usa <em>Reintentar</em> desde el log.</li>
            </ol>
        </div>

        <script>
        document.getElementById('popolo-test-btn').addEventListener('click', function () {
            const btn    = this;
            const result = document.getElementById('popolo-test-result');
            btn.disabled = true;
            result.textContent = 'Probando…';
            result.className   = '';

            fetch(ajaxurl, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: new URLSearchParams({
                    action:    'popolo_test',
                    _ajax_nonce: '<?= $nonce ?>',
                    odoo_url:  document.getElementById('popolo_odoo_url').value,
                    api_key:   document.getElementById('popolo_api_key').value,
                }),
            })
            .then(r => r.json())
            .then(data => {
                result.textContent = data.message;
                result.className   = data.ok ? 'popolo-ok' : 'popolo-error';
            })
            .catch(() => {
                result.textContent = 'Error de red';
                result.className   = 'popolo-error';
            })
            .finally(() => { btn.disabled = false; });
        });
        </script>
        <?php
    }

    /* ── Log page ─────────────────────────────────────────────────────── */
    public function render_log_page(): void {
        global $wpdb;
        $table = POPOLO_LOYALTY_TABLE;

        // Pagination
        $per_page    = 50;
        $current_page = max(1, (int) ($_GET['paged'] ?? 1));
        $offset      = ($current_page - 1) * $per_page;

        // Filter by state
        $state_filter = sanitize_text_field($_GET['state'] ?? '');
        $where        = $state_filter ? $wpdb->prepare("WHERE state = %s", $state_filter) : '';

        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} {$where}");
        $rows  = $wpdb->get_results(
            "SELECT * FROM {$table} {$where} ORDER BY synced_at DESC LIMIT {$per_page} OFFSET {$offset}",
            ARRAY_A
        );

        $nonce     = wp_create_nonce('popolo_loyalty_retry');
        $total_pages = ceil($total / $per_page);
        ?>
        <div class="wrap popolo-wrap">
            <h1>Loyalty — Log de Sincronización</h1>

            <!-- State filters -->
            <ul class="subsubsub">
                <?php
                $states = ['all' => 'Todos', 'synced' => 'Sincronizados', 'no_partner' => 'Sin contacto',
                           'error' => 'Error', 'duplicate' => 'Duplicados', 'skipped' => 'Omitidos'];
                $links  = [];
                foreach ($states as $slug => $label) {
                    $active = ($state_filter === $slug) || ($slug === 'all' && !$state_filter);
                    $url    = add_query_arg(['page' => 'popolo-loyalty-log', 'state' => ($slug === 'all' ? '' : $slug)], admin_url('admin.php'));
                    $cnt    = ($slug === 'all') ? $total : (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE state = %s", $slug));
                    $links[] = sprintf('<li><a href="%s" %s>%s <span class="count">(%d)</span></a></li>',
                        esc_url($url), $active ? 'class="current" aria-current="page"' : '', esc_html($label), $cnt);
                }
                echo implode(' | ', $links);
                ?>
            </ul>

            <table class="wp-list-table widefat fixed striped popolo-log-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Orden #</th>
                        <th>Teléfono</th>
                        <th>Total</th>
                        <th>Estado WC</th>
                        <th>Estado Sync</th>
                        <th>Puntos</th>
                        <th>Contacto Odoo</th>
                        <th>Respuesta</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                <?php if (empty($rows)): ?>
                    <tr><td colspan="10" style="text-align:center;padding:20px;">Sin registros.</td></tr>
                <?php else: foreach ($rows as $row):
                    $state_label = match ($row['state']) {
                        'synced'     => '<span class="popolo-badge ok">Sincronizado</span>',
                        'no_partner' => '<span class="popolo-badge warn">Sin contacto</span>',
                        'duplicate'  => '<span class="popolo-badge muted">Duplicado</span>',
                        'error'      => '<span class="popolo-badge err">Error</span>',
                        'skipped'    => '<span class="popolo-badge muted">Omitido</span>',
                        default      => '<span class="popolo-badge muted">' . esc_html($row['state']) . '</span>',
                    };
                    $response_data = json_decode($row['odoo_response'] ?? '{}', true);
                    $detail        = $response_data['error'] ?? ($response_data['note'] ?? '');
                    $order_url     = admin_url('post.php?post=' . $row['order_id'] . '&action=edit');
                    $can_retry     = in_array($row['state'], ['error', 'no_partner', 'skipped'], true);
                    ?>
                    <tr>
                        <td><?= esc_html(wp_date('d/m/Y H:i', strtotime($row['synced_at']))) ?></td>
                        <td><a href="<?= esc_url($order_url) ?>">#<?= esc_html($row['order_number'] ?: $row['order_id']) ?></a></td>
                        <td><?= esc_html($row['phone'] ?: '—') ?></td>
                        <td><?= esc_html(number_format((float)$row['order_total'], 2)) ?></td>
                        <td><code><?= esc_html($row['trigger_status']) ?></code></td>
                        <td><?= $state_label ?></td>
                        <td><?= $row['points_awarded'] > 0 ? '<strong>' . (int)$row['points_awarded'] . '</strong>' : '—' ?></td>
                        <td><?= esc_html($row['partner_name'] ?: '—') ?></td>
                        <td class="popolo-detail"><?= esc_html($detail) ?></td>
                        <td>
                            <?php if ($can_retry): ?>
                            <button class="button button-small popolo-retry-btn"
                                    data-order-id="<?= (int)$row['order_id'] ?>"
                                    data-trigger="<?= esc_attr($row['trigger_status']) ?>"
                                    data-nonce="<?= $nonce ?>">
                                Reintentar
                            </button>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
                </tbody>
            </table>

            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
            <div class="tablenav bottom">
                <div class="tablenav-pages">
                    <?php echo paginate_links([
                        'base'      => add_query_arg('paged', '%#%'),
                        'format'    => '',
                        'prev_text' => '&laquo;',
                        'next_text' => '&raquo;',
                        'total'     => $total_pages,
                        'current'   => $current_page,
                    ]); ?>
                </div>
            </div>
            <?php endif; ?>
        </div>

        <script>
        document.querySelectorAll('.popolo-retry-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!confirm('¿Reintentar sincronización de esta orden?')) return;
                btn.disabled = true;
                btn.textContent = '…';

                fetch(ajaxurl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: new URLSearchParams({
                        action:      'popolo_retry',
                        _ajax_nonce: btn.dataset.nonce,
                        order_id:    btn.dataset.orderId,
                        trigger:     btn.dataset.trigger,
                    }),
                })
                .then(r => r.json())
                .then(data => {
                    btn.textContent = data.success ? '✓ OK' : '✗ Error';
                    if (data.success) {
                        btn.closest('tr').querySelector('td:nth-child(6)').innerHTML =
                            '<span class="popolo-badge ok">Sincronizado</span>';
                        btn.closest('tr').querySelector('td:nth-child(7)').textContent = data.points ?? '—';
                    }
                    setTimeout(() => location.reload(), 1500);
                })
                .catch(() => { btn.textContent = '✗ Error'; });
            });
        });
        </script>
        <?php
    }

    /* ── AJAX: test connection ────────────────────────────────────────── */
    public function ajax_test(): void {
        check_ajax_referer('popolo_loyalty_test');
        if (!current_user_can('manage_woocommerce')) wp_die('Forbidden', 403);

        $url     = esc_url_raw($_POST['odoo_url'] ?? '');
        $api_key = sanitize_text_field($_POST['api_key'] ?? '');

        if (empty($url) || empty($api_key)) {
            wp_send_json(['ok' => false, 'message' => 'Completa la URL y la API Key primero.']);
        }

        $client = new Popolo_API_Client($url, $api_key);

        // 1. Health check
        $health = $client->test_connection();
        if (!$health['ok']) {
            wp_send_json(['ok' => false, 'message' => 'No se puede conectar a Odoo: ' . ($health['error'] ?? "HTTP {$health['status']}")]);
        }

        // 2. API key check
        $key_check = $client->test_api_key();
        if (!$key_check['ok']) {
            wp_send_json(['ok' => false, 'message' => 'Odoo responde, pero la API Key es inválida: ' . $key_check['message']]);
        }

        wp_send_json(['ok' => true, 'message' => 'Conexión exitosa. ' . $key_check['message']]);
    }

    /* ── AJAX: retry ─────────────────────────────────────────────────── */
    public function ajax_retry(): void {
        check_ajax_referer('popolo_loyalty_retry');
        if (!current_user_can('manage_woocommerce')) wp_die('Forbidden', 403);

        $order_id = (int) ($_POST['order_id'] ?? 0);
        $trigger  = sanitize_text_field($_POST['trigger'] ?? 'completed');

        if (!$order_id) {
            wp_send_json(['success' => false, 'error' => 'Invalid order_id']);
        }

        $result  = Popolo_Order_Sync::retry($order_id, $trigger);
        $success = ($result['state'] ?? '') === 'synced';

        wp_send_json([
            'success' => $success,
            'points'  => $result['points_awarded'] ?? 0,
            'state'   => $result['state'] ?? 'error',
        ]);
    }
}
