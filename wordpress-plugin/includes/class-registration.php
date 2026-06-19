<?php
defined('ABSPATH') || exit;

class Popolo_Registration {

    private static ?self $instance = null;

    public static function get_instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_shortcode('popolo_loyalty_register', [$this, 'render_form']);
        add_action('wp_enqueue_scripts',                        [$this, 'enqueue_scripts']);
        add_action('wp_ajax_popolo_loyalty_register',           [$this, 'ajax_register']);
        add_action('wp_ajax_nopriv_popolo_loyalty_register',    [$this, 'ajax_register']);
    }

    public function enqueue_scripts(): void {
        if (!is_singular()) {
            return;
        }
        global $post;
        if (!$post || !has_shortcode($post->post_content, 'popolo_loyalty_register')) {
            return;
        }

        wp_enqueue_style(
            'popolo-registration-form',
            POPOLO_LOYALTY_PLUGIN_URL . 'includes/registration-form.css',
            [],
            POPOLO_LOYALTY_VERSION
        );

        wp_enqueue_script(
            'popolo-registration',
            POPOLO_LOYALTY_PLUGIN_URL . 'includes/registration.js',
            ['jquery'],
            POPOLO_LOYALTY_VERSION,
            true
        );

        wp_localize_script('popolo-registration', 'popoloRegistration', [
            'ajaxurl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('popolo_loyalty_register'),
        ]);
    }

    public function render_form(): string {
        $welcome_pts = (int) get_option('popolo_loyalty_welcome_points', 10);
        ob_start();
        ?>
        <div id="popolo-register-wrap" class="popolo-register-wrap">
            <div class="popolo-register-card">

                <div class="popolo-register-header">
                    <h2>Programa de Lealtad</h2>
                    <p>Gana puntos con cada compra y canjéalos por premios exclusivos</p>
                    <?php if ($welcome_pts > 0): ?>
                    <span class="popolo-welcome-badge">
                        <?= $welcome_pts ?> puntos de bienvenida gratis
                    </span>
                    <?php endif; ?>
                </div>

                <div class="popolo-register-body">
                    <div id="popolo-register-message" class="popolo-register-msg"></div>

                    <form id="popolo-register-form" novalidate>
                        <div class="popolo-register-grid">

                            <div class="popolo-field">
                                <label for="loyalty_name">Nombre <span class="required">*</span></label>
                                <input type="text" id="loyalty_name" name="loyalty_name"
                                       placeholder="Tu nombre" required>
                            </div>

                            <div class="popolo-field">
                                <label for="loyalty_lastname">Apellido</label>
                                <input type="text" id="loyalty_lastname" name="loyalty_lastname"
                                       placeholder="Tu apellido">
                            </div>

                            <div class="popolo-field popolo-field-full">
                                <label for="loyalty_email">Correo electrónico <span class="required">*</span></label>
                                <input type="email" id="loyalty_email" name="loyalty_email"
                                       placeholder="correo@ejemplo.com" required>
                            </div>

                            <div class="popolo-field popolo-field-full">
                                <label for="loyalty_phone">Teléfono <span class="required">*</span></label>
                                <input type="tel" id="loyalty_phone" name="loyalty_phone"
                                       placeholder="999 999 999" required>
                            </div>

                            <div class="popolo-field popolo-field-full">
                                <label for="loyalty_birth_date">Fecha de nacimiento <span class="required">*</span></label>
                                <input type="date" id="loyalty_birth_date" name="loyalty_birth_date"
                                       max="<?= esc_attr(date('Y-m-d')) ?>" required>
                                <span class="field-hint">Para recibir tu regalo de cumpleanos en el local</span>
                            </div>

                        </div>

                        <hr class="popolo-register-divider">

                        <button type="submit" id="popolo-register-submit" class="popolo-register-btn">
                            Registrarme
                        </button>

                        <p class="popolo-register-privacy">
                            Tu informacion esta protegida y no sera compartida con terceros.
                        </p>
                    </form>
                </div>

            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    public function ajax_register(): void {
        check_ajax_referer('popolo_loyalty_register');

        $name       = sanitize_text_field($_POST['name']       ?? '');
        $lastname   = sanitize_text_field($_POST['lastname']   ?? '');
        $email      = sanitize_email($_POST['email']           ?? '');
        $phone      = sanitize_text_field($_POST['phone']      ?? '');
        $birth_date = sanitize_text_field($_POST['birth_date'] ?? '');

        // Validate birth_date format YYYY-MM-DD
        if ($birth_date && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $birth_date)) {
            $birth_date = '';
        }

        if (empty($name) || !is_email($email) || empty($phone) || empty($birth_date)) {
            wp_send_json([
                'success'        => false,
                'already_member' => false,
                'message'        => 'Por favor completa todos los campos requeridos, incluida la fecha de nacimiento.',
            ]);
        }

        $odoo_url = get_option('popolo_loyalty_odoo_url', '');
        $api_key  = get_option('popolo_loyalty_api_key', '');

        if (empty($odoo_url) || empty($api_key)) {
            wp_send_json([
                'success'        => false,
                'already_member' => false,
                'message'        => 'El sistema de lealtad no está configurado. Contacta al administrador.',
            ]);
        }

        $client = new Popolo_API_Client($odoo_url, $api_key);
        $result = $client->register_loyalty([
            'name'           => $name,
            'last_name'      => $lastname,
            'email'          => strtolower($email),
            'phone'          => preg_replace('/[\s\-\(\)\+]/', '', $phone),
            'birth_date'     => $birth_date,
            'welcome_points' => (int) get_option('popolo_loyalty_welcome_points', 10),
        ]);

        if ($result['success']) {
            $body           = $result['body'];
            $partner_name   = $body['partner_name']   ?? $name;
            $welcome_points = (int) ($body['welcome_points'] ?? 0);

            // Log to WP loyalty table
            global $wpdb;
            $wpdb->insert(POPOLO_LOYALTY_TABLE, [
                'order_id'       => 0,
                'order_number'   => 'REGISTRO',
                'phone'          => preg_replace('/[\s\-\(\)\+]/', '', $phone),
                'order_total'    => 0,
                'trigger_status' => 'registration',
                'state'          => 'synced',
                'points_awarded' => $welcome_points,
                'partner_name'   => $partner_name,
                'odoo_response'  => wp_json_encode($body),
                'synced_at'      => current_time('mysql'),
            ]);

            // Create WooCommerce customer if not already registered
            $wc_note = '';
            if (!email_exists($email)) {
                $user_id = wc_create_new_customer($email, $email, wp_generate_password(12, false));
                if (!is_wp_error($user_id)) {
                    wp_update_user([
                        'ID'         => $user_id,
                        'first_name' => $name,
                        'last_name'  => $lastname,
                        'display_name' => $partner_name,
                    ]);
                    update_user_meta($user_id, 'billing_first_name', $name);
                    update_user_meta($user_id, 'billing_last_name',  $lastname);
                    update_user_meta($user_id, 'billing_email',      $email);
                    update_user_meta($user_id, 'billing_phone',      preg_replace('/[\s\-\(\)\+]/', '', $phone));
                    if ($birth_date) {
                        update_user_meta($user_id, '_loyalty_birth_date', $birth_date);
                    }
                }
            } else {
                $wc_note = ' Tu cuenta de WooCommerce ya existe.';
            }

            $msg = $welcome_points > 0
                ? sprintf('¡Bienvenido/a <strong>%s</strong>! Te hemos asignado <strong>%d puntos</strong> por registrarte en el programa de lealtad. Revisa tu correo para acceder a tu cuenta.%s', esc_html($partner_name), $welcome_points, $wc_note)
                : sprintf('¡Bienvenido/a <strong>%s</strong>! Ya eres parte del programa de lealtad. Revisa tu correo para acceder a tu cuenta.%s', esc_html($partner_name), $wc_note);

            wp_send_json([
                'success'        => true,
                'already_member' => false,
                'message'        => $msg,
                'points'         => $welcome_points,
            ]);

        } elseif ($result['already_registered']) {
            wp_send_json([
                'success'        => false,
                'already_member' => true,
                'message'        => 'Este correo ya está registrado en el programa de lealtad.',
            ]);

        } else {
            $error = $result['body']['error'] ?? 'Error desconocido';
            wp_send_json([
                'success'        => false,
                'already_member' => false,
                'message'        => 'Ocurrió un error al procesar tu registro: ' . esc_html($error),
            ]);
        }
    }
}
