<?php
defined('ABSPATH') || exit;

class Popolo_Checkout {

    // Valor dummy para "Recojo en tienda" (sin dirección real que pedir).
    // Debe matchear exactamente el string que escribe checkout.js
    // (fillDummyBillingAddress) en el campo oculto.
    private const DUMMY_ADDRESS = 'Sin Dirección';

    // "Detalles de la cuenta" (My Account) muestra estos mismos 3 campos
    // vía la Additional Fields API de WooCommerce (register_block_fields()
    // los registra con location:'contact', y WC los expone automáticamente
    // también en Mi Cuenta, no es algo que este plugin pida explícitamente).
    // Esa API guarda por su cuenta en su propio storage
    // (_wc_other/popolo-loyalty/*) — separado de billing_doc_type/etc, que
    // es lo que realmente lee Odoo/Popolo Rewards (on_customer_created(),
    // capture_block_data()). Sin el puente de abajo, un cliente que edita
    // su DNI desde Mi Cuenta quedaría desconectado del dato real.
    private const FIELD_TO_BILLING_META = [
        'popolo-loyalty/doc-type'   => 'billing_doc_type',
        'popolo-loyalty/doc-number' => 'billing_doc_number',
        'popolo-loyalty/birth-date' => 'billing_birth_date',
    ];

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

        // Puente Additional Fields API (Mi Cuenta) ↔ billing_doc_type/etc
        // (Odoo/Popolo Rewards) — ver comentario de FIELD_TO_BILLING_META.
        foreach (self::FIELD_TO_BILLING_META as $field_key => $meta_key) {
            add_filter(
                "woocommerce_get_default_value_for_{$field_key}",
                function ($value, $group, $wc_object) use ($meta_key) {
                    return $this->default_value_from_billing_meta($value, $wc_object, $meta_key);
                },
                10,
                3
            );
        }
        add_action('woocommerce_set_additional_field_value', [$this, 'sync_additional_field_to_billing_meta'], 10, 4);

        // Capture block checkout data from request (more reliable than order meta)
        add_action('woocommerce_store_api_checkout_update_order_from_request',
            [$this, 'capture_block_data'], 10, 2);

        // Local restaurant, only delivers within Lima Metropolitana: lock every
        // real order to Perú / Lima Metropolitana regardless of what was posted
        add_action('woocommerce_store_api_checkout_update_order_from_request',
            [$this, 'force_peru_lima_address'], 5, 1);

        // No mostramos "Dirección de facturación" cuando hay envío (ver CSS
        // en popolo-app-theme) — la orden real siempre queda con la misma
        // dirección en billing y shipping. Corre último (15) para pisar
        // cualquier dato de facturación que haya llegado en el request.
        add_action('woocommerce_store_api_checkout_update_order_from_request',
            [$this, 'sync_billing_to_shipping'], 15, 1);

        // Sync to Odoo after block order is fully processed
        add_action('woocommerce_store_api_checkout_order_processed',
            [$this, 'on_block_order_processed'], 20);

        // Recojo en tienda: limpiar el dummy "Sin Dirección" de la sesión
        // (no de la orden) apenas termina de procesarse todo el pedido
        add_action('woocommerce_store_api_checkout_order_processed',
            [$this, 'reset_customer_session_after_pickup'], 30);

        // My-Account registration fields (classic form)
        add_action('woocommerce_register_form',  [$this, 'render_register_doc_fields']);
        add_action('woocommerce_register_post',  [$this, 'validate_register_doc_fields'], 10, 3);

        // Customer created — My-Account or block checkout
        add_action('woocommerce_created_customer', [$this, 'on_customer_created'], 10);

        // Hide postal code and company; default state to Lima; rename city to Distrito
        add_filter('woocommerce_get_country_locale',        [$this, 'adjust_address_locale']);
        add_filter('woocommerce_default_address_fields',    [$this, 'adjust_address_defaults']);
        add_filter('woocommerce_customer_default_location', [$this, 'default_lima_state']);
        add_filter('woocommerce_checkout_fields',           [$this, 'rename_city_to_distrito']);
        add_filter('woocommerce_billing_fields',            [$this, 'rename_city_to_distrito']);
        add_filter('woocommerce_shipping_fields',           [$this, 'rename_city_to_distrito']);

        // Welcome notice after registration
        add_action('template_redirect', [$this, 'maybe_show_welcome_notice']);

        // Thumbnail redondeado en la página clásica de producto (fallback
        // sin modal) — ver output_shop_styles()
        add_action('wp_head', [$this, 'output_shop_styles']);

        // Scripts & styles
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);

        // Limpiar prefijo duplicado en metadata (ej. "Tamaño: Tamaño: Grande 35CM")
        // que WooCommerce puede generar cuando el display_value ya incluye el label
        add_filter('woocommerce_order_item_get_formatted_meta_data', [$this, 'clean_duplicate_attribute_prefix']);

        // Misma limpieza pero en el nombre del término del atributo — causa
        // real del duplicado: varios términos de atributo (pa_tamano, pa_sabor,
        // etc.) tienen el label incluido en el nombre de la BD (ej. término
        // "Tamaño: Grande 35CM" para la taxonomía "Tamaño"). Este filtro corre
        // en el Store API (resumen de carrito/checkout) y en el resto de
        // WooCommerce Core cada vez que arma "Label: Value" a partir del
        // nombre del término — sin esto, el resumen de checkout (que combina
        // label + nombre del término por separado) muestra el duplicado.
        add_filter('woocommerce_variation_option_name', [$this, 'clean_duplicate_variation_option_name'], 10, 3);

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
            'required'          => false,
            'validate_callback' => function ($value) {
                if (empty($value)) return true;
                return in_array($value, ['DNI', 'CE', 'Pasaporte'], true)
                    ? true
                    : new WP_Error('invalid_doc_type', 'Tipo de documento no válido.');
            },
        ]);

        woocommerce_register_additional_checkout_field([
            'id'       => 'popolo-loyalty/doc-number',
            'label'    => 'Número de documento',
            'location' => 'contact',
            'type'     => 'text',
            'required' => false,
        ]);

        woocommerce_register_additional_checkout_field([
            'id'                => 'popolo-loyalty/birth-date',
            'label'             => 'Fecha de nacimiento',
            'location'          => 'contact',
            'type'              => 'text',
            'required'          => false,
            'attributes'        => [
                'autocomplete'      => 'bday',
                'data-popolo-birth' => '1',
            ],
            'validate_callback' => function ($value) {
                $value = trim($value ?? '');
                if (empty($value)) return true;
                if (!preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value)) {
                    return new WP_Error('birth_date_format', 'Ingresa la fecha en formato DD/MM/AAAA.');
                }
                [$d, $m, $y] = explode('/', $value);
                if (!checkdate((int) $m, (int) $d, (int) $y)) {
                    return new WP_Error('birth_date_invalid', 'La fecha de nacimiento no es válida.');
                }
                return true;
            },
        ]);
    }

    /* ── Puente Additional Fields (Mi Cuenta) ↔ billing_doc_type/etc ───── */

    /**
     * Precarga el campo en "Detalles de la cuenta" desde billing_doc_type
     * (o el que corresponda) cuando la Additional Fields API todavía no
     * tiene su propio valor guardado (_wc_other/*) — típicamente la
     * primera vez que el cliente visita esa pantalla después de haberse
     * registrado, cuyo DNI/cumpleaños ya está en billing_* desde el
     * registro, no en el storage nuevo de esta API.
     */
    private function default_value_from_billing_meta($value, $wc_object, string $meta_key) {
        if (!($wc_object instanceof WC_Customer)) {
            return $value;
        }
        $existing = get_user_meta($wc_object->get_id(), $meta_key, true);
        if ($existing === '') {
            return $value;
        }
        // billing_birth_date se guarda en ISO (YYYY-MM-DD, normalize_date());
        // el campo del form espera DD/MM/AAAA (lo que enmascara birthday-picker.js).
        if ('billing_birth_date' === $meta_key && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $existing, $m)) {
            return "{$m[3]}/{$m[2]}/{$m[1]}";
        }
        return $existing;
    }

    /**
     * Cuando el cliente edita estos campos desde "Detalles de la cuenta",
     * además de guardarse en el storage propio de la Additional Fields API
     * (comportamiento nativo de WooCommerce, no se toca), se espeja a
     * billing_doc_type/etc — el storage real que usa on_customer_created()/
     * capture_block_data() para sincronizar con Odoo/Popolo Rewards.
     */
    public function sync_additional_field_to_billing_meta(string $key, $value, string $group, $wc_object): void {
        if (!($wc_object instanceof WC_Customer) || !isset(self::FIELD_TO_BILLING_META[$key])) {
            return;
        }
        $meta_key = self::FIELD_TO_BILLING_META[$key];
        if ('billing_birth_date' === $meta_key) {
            $value = $this->normalize_date((string) $value);
            if ($value === '') {
                return; // fecha inválida/vacía: no pisar lo que ya había
            }
        }
        update_user_meta($wc_object->get_id(), $meta_key, $value);
    }

    /* ── Capture block checkout data from request ─────────────────────── */

    /**
     * Fires with both $order and $request during Store API checkout.
     * Reads additional fields directly from the JSON body — more reliable
     * than reading from order meta in the processed hook.
     */
    public function capture_block_data(WC_Order $order, WP_REST_Request $request): void {
        $body       = (array) ($request->get_json_params() ?: []);
        $billing    = (array) ($body['billing_address']  ?? []);
        $additional = (array) ($body['additional_fields'] ?? []);

        // WC blocks 8.6+ sends contact fields under additional_fields;
        // older builds may nest them in billing_address or at the top level
        $doc_type   = sanitize_text_field(
            $additional['popolo-loyalty/doc-type']   ??
            $billing['popolo-loyalty/doc-type']      ??
            $body['popolo-loyalty/doc-type']         ?? ''
        );
        $doc_number = sanitize_text_field(
            $additional['popolo-loyalty/doc-number'] ??
            $billing['popolo-loyalty/doc-number']    ??
            $body['popolo-loyalty/doc-number']       ?? ''
        );
        $birth_raw  = sanitize_text_field(
            $additional['popolo-loyalty/birth-date'] ??
            $billing['popolo-loyalty/birth-date']    ??
            $body['popolo-loyalty/birth-date']       ?? ''
        );
        $birth_date = $this->normalize_date($birth_raw);

        if ($doc_type)   $order->update_meta_data('_popolo_doc_type',   $doc_type);
        if ($doc_number) $order->update_meta_data('_popolo_doc_number', $doc_number);
        if ($birth_date) $order->update_meta_data('_popolo_birth_date', $birth_date);
    }

    private function normalize_date(string $raw): string {
        $raw = trim($raw);
        if (!$raw) return '';
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) return $raw;
        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $raw, $m)) {
            return checkdate((int) $m[2], (int) $m[1], (int) $m[3])
                ? "{$m[3]}-{$m[2]}-{$m[1]}" : '';
        }
        return '';
    }

    /* ── Customer created ─────────────────────────────────────────────── */

    public function on_customer_created(int $customer_id): void {
        // My-Account classic form populates $_POST
        $first_name = sanitize_text_field($_POST['reg_first_name'] ?? '');
        $last_name  = sanitize_text_field($_POST['reg_last_name']  ?? '');
        $phone      = sanitize_text_field($_POST['reg_phone']      ?? '');
        $type       = sanitize_text_field($_POST['reg_doc_type']   ?? '');
        $number     = sanitize_text_field($_POST['reg_doc_number'] ?? '');
        $birth_date = $this->normalize_date(sanitize_text_field($_POST['reg_birth_date'] ?? ''));

        if ($type || $number || $birth_date || $first_name || $last_name || $phone) {
            if ($first_name) update_user_meta($customer_id, 'billing_first_name', $first_name);
            if ($last_name)  update_user_meta($customer_id, 'billing_last_name',  $last_name);
            if ($phone)      update_user_meta($customer_id, 'billing_phone',      $phone);
            // Además de billing_first_name/last_name (lo que lee el checkout),
            // se actualizan first_name/last_name "pelados" — son las claves
            // que WordPress usa para $user->first_name/last_name en todo el
            // resto del sitio (ej. myaccount/form-edit-account.php). Sin
            // esto, "Detalles de la cuenta" mostraba esos campos vacíos para
            // cualquier cuenta creada por este registro, y como son
            // requeridos, ni siquiera dejaba guardar otros cambios sin
            // completarlos a mano primero.
            if ($first_name || $last_name) {
                wp_update_user(array_filter([
                    'ID'         => $customer_id,
                    'first_name' => $first_name ?: null,
                    'last_name'  => $last_name  ?: null,
                ]));
            }
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

        // Always sync address so next checkout is pre-filled
        $this->sync_address_to_user($customer_id, $order);

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

    /* ── Address sync ────────────────────────────────────────────────── */

    private function sync_address_to_user(int $user_id, WC_Order $order): void {
        foreach (['first_name', 'last_name', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'email', 'phone'] as $f) {
            $v = $order->{"get_billing_{$f}"}();
            if ($v !== '' && $v !== null) update_user_meta($user_id, "billing_{$f}", $v);
        }
        foreach (['first_name', 'last_name', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country'] as $f) {
            $v = $order->{"get_shipping_{$f}"}();
            if ($v !== '' && $v !== null) update_user_meta($user_id, "shipping_{$f}", $v);
        }
        if (method_exists($order, 'get_shipping_phone')) {
            $v = $order->get_shipping_phone();
            if ($v) update_user_meta($user_id, 'shipping_phone', $v);
        }
    }

    /* ── My-Account registration fields ───────────────────────────────── */

    public function render_register_doc_fields(): void {
        ?>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_first_name" class="screen-reader-text">Nombre</label>
            <input type="text" name="reg_first_name" id="reg_first_name"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   autocomplete="given-name" placeholder="Nombre *" maxlength="60" value="">
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_last_name" class="screen-reader-text">Apellido</label>
            <input type="text" name="reg_last_name" id="reg_last_name"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   autocomplete="family-name" placeholder="Apellido *" maxlength="60" value="">
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_doc_type" class="screen-reader-text">Tipo de documento</label>
            <select name="reg_doc_type" id="reg_doc_type" class="woocommerce-Input" style="width:100%;box-sizing:border-box;color:#757575;">
                <option value="">Tipo de documento *</option>
                <option value="DNI">DNI</option>
                <option value="CE">C.E.</option>
                <option value="Pasaporte">Pasaporte</option>
            </select>
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_doc_number" class="screen-reader-text">Número de documento</label>
            <input type="text" name="reg_doc_number" id="reg_doc_number"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   maxlength="20" placeholder="Número de documento *" value="">
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_phone" class="screen-reader-text">Teléfono</label>
            <input type="tel" name="reg_phone" id="reg_phone"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   autocomplete="tel" placeholder="Teléfono *" maxlength="20" value="">
        </p>
        <p class="woocommerce-form-row woocommerce-form-row--wide form-row form-row-wide">
            <label for="reg_birth_date" class="screen-reader-text">Fecha de nacimiento</label>
            <input type="text" name="reg_birth_date" id="reg_birth_date"
                   class="woocommerce-Input woocommerce-Input--text input-text"
                   autocomplete="bday" placeholder="Fecha de nacimiento * (DD/MM/AAAA)" maxlength="10"
                   inputmode="numeric" value="">
        </p>
        <div class="clear"></div>
        <?php
    }

    public function validate_register_doc_fields(string $username, string $email, WP_Error $errors): void {
        // Block checkout creates accounts via REST API — $_POST is empty in that context.
        // Additional fields are validated via their own validate_callback instead.
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return;
        }

        $first_name = sanitize_text_field($_POST['reg_first_name'] ?? '');
        $last_name  = sanitize_text_field($_POST['reg_last_name']  ?? '');
        $phone      = sanitize_text_field($_POST['reg_phone']      ?? '');
        $type       = sanitize_text_field($_POST['reg_doc_type']   ?? '');
        $number     = sanitize_text_field($_POST['reg_doc_number'] ?? '');
        $birth_raw  = sanitize_text_field($_POST['reg_birth_date'] ?? '');

        if (empty(trim($first_name))) {
            $errors->add('reg_first_name_empty', 'Por favor ingresa tu nombre.');
        }
        if (empty(trim($last_name))) {
            $errors->add('reg_last_name_empty', 'Por favor ingresa tu apellido.');
        }
        if (empty($type)) {
            $errors->add('reg_doc_type_empty', 'Por favor selecciona el tipo de documento.');
        }
        if (empty(trim($number))) {
            $errors->add('reg_doc_number_empty', 'Por favor ingresa el número de documento.');
        }
        if (empty(trim($phone))) {
            $errors->add('reg_phone_empty', 'Por favor ingresa tu teléfono.');
        }
        if (empty($birth_raw)) {
            $errors->add('reg_birth_date_empty', 'Por favor ingresa tu fecha de nacimiento.');
        } elseif (!preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $birth_raw)) {
            $errors->add('reg_birth_date_format', 'Ingresa la fecha en formato DD/MM/AAAA.');
        } else {
            [$d, $m, $y] = explode('/', $birth_raw);
            if (!checkdate((int) $m, (int) $d, (int) $y)) {
                $errors->add('reg_birth_date_invalid', 'La fecha de nacimiento no es válida.');
            }
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

        $client   = new Popolo_API_Client($odoo_url, $api_key);
        $response = $client->register_customer($payload);

        $welcome_pts = intval($response['welcome_points'] ?? 0);
        if ($welcome_pts > 0) {
            $msg = '¡Felicidades! Gracias por registrarte a <strong>Popolo Rewards</strong>.'
                 . ' ¡Has ganado <strong>' . number_format($welcome_pts) . ' puntos</strong>!'
                 . ' Consulta tus puntos y premios en'
                 . ' <a href="https://rewards.popolopizza.com" target="_blank">rewards.popolopizza.com</a>';
            set_transient('popolo_welcome_notice_' . $customer_id, $msg, 300);
        }
    }

    /* ── Welcome notice after registration ───────────────────────────── */

    public function maybe_show_welcome_notice(): void {
        if (!is_user_logged_in()) return;
        $user_id = get_current_user_id();
        $key     = 'popolo_welcome_notice_' . $user_id;
        $msg     = get_transient($key);
        if (!$msg) return;
        delete_transient($key);
        wc_add_notice($msg, 'success');
    }

    /* ── Address field adjustments ────────────────────────────────────── */

    public function adjust_address_locale(array $locale): array {
        $locale['PE']['postcode'] = ['required' => false, 'hidden' => true];
        $locale['PE']['company']  = ['required' => false, 'hidden' => true];
        $locale['PE']['city']     = ['label' => 'Distrito'];
        // Restaurante local, solo reparte en Lima Metropolitana: la provincia
        // no se ofrece a elección, se fuerza más abajo (force_peru_lima_address).
        $locale['PE']['state']    = ['label' => 'Provincia', 'required' => false, 'hidden' => true];
        return $locale;
    }

    public function rename_city_to_distrito(array $fields): array {
        // woocommerce_checkout_fields has nested billing/shipping arrays;
        // woocommerce_billing_fields / woocommerce_shipping_fields are flat.
        foreach (['billing', 'shipping'] as $group) {
            if (isset($fields[$group]['billing_city'])) {
                $fields[$group]['billing_city']['label']       = 'Distrito';
                $fields[$group]['billing_city']['placeholder'] = 'Distrito';
            }
            if (isset($fields[$group]['shipping_city'])) {
                $fields[$group]['shipping_city']['label']       = 'Distrito';
                $fields[$group]['shipping_city']['placeholder'] = 'Distrito';
            }
        }
        // Flat array (billing_fields / shipping_fields)
        if (isset($fields['billing_city'])) {
            $fields['billing_city']['label']       = 'Distrito';
            $fields['billing_city']['placeholder'] = 'Distrito';
        }
        if (isset($fields['shipping_city'])) {
            $fields['shipping_city']['label']       = 'Distrito';
            $fields['shipping_city']['placeholder'] = 'Distrito';
        }
        if (isset($fields['billing_state'])) {
            $fields['billing_state']['label'] = 'Provincia';
        }
        if (isset($fields['shipping_state'])) {
            $fields['shipping_state']['label'] = 'Provincia';
        }
        // nested billing/shipping groups
        foreach (['billing', 'shipping'] as $group) {
            if (isset($fields[$group]['billing_state'])) {
                $fields[$group]['billing_state']['label'] = 'Provincia';
            }
            if (isset($fields[$group]['shipping_state'])) {
                $fields[$group]['shipping_state']['label'] = 'Provincia';
            }
        }
        return $fields;
    }

    public function adjust_address_defaults(array $fields): array {
        $fields['postcode']['required'] = false;
        $fields['postcode']['hidden']   = true;
        $fields['company']['required']  = false;
        $fields['company']['hidden']    = true;
        return $fields;
    }

    public function default_lima_state($location) {
        if (!is_array($location)) {
            return $location;
        }
        // Único mercado del negocio: siempre Perú / Lima Metropolitana,
        // sin importar geolocalización u otro default previo.
        $location['country'] = 'PE';
        $location['state']   = 'LMA';
        return $location;
    }

    /**
     * Fuerza País=Perú / Provincia=Lima Metropolitana en cada orden real
     * (el checkout de este sitio procesa el 100% de las compras vía Store
     * API). El campo país/provincia está oculto en el formulario, pero esto
     * garantiza el dato aunque llegue vacío o manipulado en el request.
     */
    public function force_peru_lima_address(WC_Order $order): void {
        $order->set_billing_country('PE');
        $order->set_billing_state('LMA');
        $order->set_shipping_country('PE');
        $order->set_shipping_state('LMA');
    }

    /**
     * "Dirección de facturación" ya no se muestra en el checkout cuando hay
     * envío (ver CSS en popolo-app-theme, sección "Dirección de facturación
     * redundante"): la orden real siempre queda con billing = shipping. En
     * "Recojo en tienda" no hay dirección de envío que copiar (WC Blocks no
     * renderiza ese bloque), así que ahí la facturación se deja tal cual
     * vino del form — es la única fuente de Nombre/Teléfono del cliente que
     * recoge.
     */
    public function sync_billing_to_shipping(WC_Order $order): void {
        $shipping_address_1 = $order->get_shipping_address_1();
        $has_real_shipping   = $shipping_address_1 !== '' && $shipping_address_1 !== self::DUMMY_ADDRESS;

        if (!$has_real_shipping) {
            // Recojo en tienda: no hay dirección de envío real que copiar.
            // El campo Dirección/Distrito está oculto (ver CSS) pero WC
            // Blocks igual exige un valor para dejar avanzar el checkout
            // (probado: no hay filtro PHP que se lo relaje para estos
            // campos base, a diferencia de postcode/company/state) —
            // checkout.js rellena el dummy en el campo, y como en Recojo no
            // existe un form de envío separado, WC Blocks manda ese MISMO
            // valor también como shipping_address (por eso no alcanza con
            // "empty()" para detectar este caso — shipping_address_1 llega
            // con el dummy, no vacío). Ese relleno queda grabado en la
            // sesión (ver reset_customer_session_after_pickup más abajo).
            if (empty($order->get_billing_address_1())) {
                $order->set_billing_address_1(self::DUMMY_ADDRESS);
            }
            if (empty($order->get_billing_city())) {
                $order->set_billing_city(self::DUMMY_ADDRESS);
            }
            return;
        }
        $order->set_billing_first_name($order->get_shipping_first_name());
        $order->set_billing_last_name($order->get_shipping_last_name());
        $order->set_billing_address_1($order->get_shipping_address_1());
        $order->set_billing_address_2($order->get_shipping_address_2());
        $order->set_billing_city($order->get_shipping_city());
        $order->set_billing_postcode($order->get_shipping_postcode());
        $order->set_billing_phone($order->get_shipping_phone());
    }

    /**
     * checkout.js rellena el dummy en el campo oculto de facturación de
     * "Recojo en tienda" (ver sync_billing_to_shipping) porque WC Blocks
     * exige un valor para avanzar el checkout. Ese relleno dispara un
     * update-customer real contra la sesión de WooCommerce (Store API), y
     * como en Recojo no existe un formulario de envío separado, WC Blocks
     * manda el mismo valor también como shipping_address — quedando el
     * dummy grabado en AMBAS direcciones de la sesión del cliente. Si no se
     * limpia, el siguiente checkout en el mismo navegador (aunque sea un
     * Delivery real) arranca con esa basura pre-cargada en el campo real de
     * dirección de envío (bug 2026-07-08, orden de prueba #1012491).
     *
     * Se resetea acá, colgado de "order_processed" (corre DESPUÉS de que
     * termina todo el pipeline de la orden) en vez de en
     * sync_billing_to_shipping — enganchado ahí el reset no sobrevivía,
     * algo en el resto del procesamiento de la orden volvía a copiar los
     * datos hacia la sesión del cliente.
     */
    public function reset_customer_session_after_pickup(WC_Order $order): void {
        $shipping_address_1 = $order->get_shipping_address_1();
        $has_real_shipping   = $shipping_address_1 !== '' && $shipping_address_1 !== self::DUMMY_ADDRESS;

        if ($has_real_shipping) {
            return; // hubo envío real, no tocar la sesión
        }
        if (!function_exists('WC') || !(WC()->customer instanceof WC_Customer)) {
            return;
        }
        WC()->customer->set_billing_address_1('');
        WC()->customer->set_billing_city('');
        WC()->customer->set_shipping_address_1('');
        WC()->customer->set_shipping_city('');
        WC()->customer->save();
    }

    /**
     * `.product-thumbnail` es una clase estándar de WooCommerce (no de
     * Razzi) — solo importa cuando un producto cae en la página clásica de
     * producto individual (fallback de product-card.php cuando no hay
     * modal_payload, ej. producto sin stock o variable sin variaciones
     * comprables), ya que popolo-app-theme no tiene single-product.php
     * propio y esa página usa el template default de WooCommerce.
     */
    public function output_shop_styles(): void {
        echo '<style>.product-thumbnail img { border-radius: 24px; }</style>' . "\n";
    }

    /* ── Scripts & styles ─────────────────────────────────────────────── */

    public function enqueue_scripts(): void {
        if (!get_option('popolo_loyalty_enabled', '1')) {
            return;
        }

        $logged_in     = is_user_logged_in();
        $on_checkout   = is_checkout() && !is_order_received_page();
        $on_order_rcvd = is_order_received_page();
        $on_cart       = is_cart();
        // Drawer de login/registro (popolo-app-theme, template-parts/login-drawer.php)
        // vive en el home — el campo #reg_birth_date necesita la máscara ahí también.
        $on_shop       = function_exists('is_shop') && is_shop();

        if ($on_checkout || is_account_page() || $on_shop) {
            wp_enqueue_script(
                'popolo-birthday-mask',
                POPOLO_LOYALTY_PLUGIN_URL . 'includes/birthday-picker.js',
                [],
                POPOLO_LOYALTY_VERSION,
                true
            );
        }

        if ($on_checkout) {
            wp_add_inline_style(
                'wc-blocks-style',
                '.wc-block-checkout__use-address-for-billing { display: none !important; }'
            );
        }

        if ($on_checkout || $on_order_rcvd || $on_cart) {
            wp_enqueue_script(
                'popolo-checkout',
                POPOLO_LOYALTY_PLUGIN_URL . 'includes/checkout.js',
                ['jquery'],
                POPOLO_LOYALTY_VERSION,
                true
            );

            $cart_total    = ($on_checkout && WC()->cart) ? floatval(WC()->cart->get_subtotal()) : 0;
            $current_email = $logged_in ? wp_get_current_user()->user_email : '';
            $page          = $on_cart ? 'cart' : ($on_order_rcvd ? 'thankyou' : 'checkout');

            wp_localize_script('popolo-checkout', 'popoloLoyalty', [
                'ajaxurl'      => admin_url('admin-ajax.php'),
                'nonce'        => wp_create_nonce('popolo_get_points'),
                'cartTotal'    => $cart_total,
                'currentEmail' => $current_email,
                'userLoggedIn' => $logged_in,
                'page'         => $page,
            ]);
        }
    }

    /* ── Metadata cleanup ──────────────────────────────────────────────── */

    /**
     * Limpia prefijo duplicado en metadata cuando display_value ya incluye
     * el display_key (ej. "Tamaño: Tamaño: Grande 35CM" → "Tamaño: Grande 35CM").
     * WooCommerce puede generar display_value con el label incluido,
     * y algunos templates agregan el label NUEVAMENTE.
     */
    public function clean_duplicate_attribute_prefix($formatted_meta) {
        if (empty($formatted_meta) || !is_array($formatted_meta)) {
            return $formatted_meta;
        }

        foreach ($formatted_meta as $meta) {
            if (!isset($meta->display_key, $meta->display_value)) {
                continue;
            }

            $key   = wp_strip_all_tags($meta->display_key);
            $value = wp_strip_all_tags($meta->display_value);

            // Si display_value comienza con "Key: ", es redundante — mostrar solo el value
            if (!empty($key) && str_starts_with($value, $key . ': ')) {
                $meta->display_value = $value;
                // display_key queda igual; el template lo agregará una vez sola
            }
        }

        return $formatted_meta;
    }

    /**
     * Limpia el mismo duplicado de prefijo pero a nivel del nombre del
     * término de atributo (ej. taxonomía "pa_tamano", término con nombre
     * "Tamaño: Grande 35CM"). $taxonomy llega como el nombre de la
     * taxonomía (ej. "pa_tamano") cuando el atributo es global.
     */
    public function clean_duplicate_variation_option_name($value, $term, $taxonomy) {
        if (!is_string($value) || empty($taxonomy)) {
            return $value;
        }

        $label = wc_attribute_label($taxonomy);
        if (!empty($label) && str_starts_with($value, $label . ': ')) {
            return substr($value, strlen($label) + 2);
        }

        return $value;
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
