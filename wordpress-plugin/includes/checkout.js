(function ($) {
    'use strict';

    var timer       = null;
    var lastEmail   = '';
    var $widget     = null;
    var isBlockCO   = false;

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function esc(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isValidEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    function fmt(n) {
        return Number(n).toLocaleString('es-PE');
    }

    /* ── Widget UI ───────────────────────────────────────────────────────── */

    function showWidget(name, points, ratio, cartTotal) {
        if (!$widget) return;
        var earned = (ratio > 0 && cartTotal > 0) ? Math.floor(cartTotal * ratio) : 0;
        var after  = points + earned;

        var html = '🎁 Hola <strong>' + esc(name) + '</strong>'
                 + ' — tienes <strong>' + fmt(points) + ' puntos</strong>';

        if (earned > 0) {
            html += ' · esta compra suma <strong>+' + fmt(earned) + ' pts</strong>'
                  + ' · total: <strong>' + fmt(after) + ' pts</strong>';
        }

        $widget.html(html).slideDown(250);
    }

    function hideWidget() {
        if ($widget) $widget.slideUp(200).html('');
    }

    /* ── Points lookup ───────────────────────────────────────────────────── */

    function lookupPoints(email) {
        var cartTotal = parseFloat(popoloLoyalty.cartTotal || 0);

        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found) {
                var ratio = parseFloat(data.points_ratio || 0);
                showWidget(data.partner_name, data.total_points || 0, ratio, cartTotal);
            } else {
                hideWidget();
            }
        })
        .fail(function () { hideWidget(); });
    }

    function onEmail(email) {
        email = (email || '').trim().toLowerCase();
        if (email === lastEmail) return;
        lastEmail = email;
        clearTimeout(timer);
        if (!isValidEmail(email)) { hideWidget(); return; }
        timer = setTimeout(function () { lookupPoints(email); }, 700);
    }

    /* ── Block checkout integration ──────────────────────────────────────── */

    function findPoloFieldWrappers() {
        var wrappers = [];
        ['doc-type', 'doc-number', 'birth-date'].forEach(function (key) {
            var input = document.querySelector('[id*="' + key + '"]') ||
                        document.querySelector('[name*="' + key + '"]');
            if (!input) return;
            var wrapper = input.closest('.wc-block-components-text-input') ||
                          input.closest('.wc-block-components-select-input') ||
                          input.closest('.wc-block-components-form-token-field-wrapper') ||
                          input.parentElement && input.parentElement.parentElement;
            if (wrapper) wrappers.push(wrapper);
        });
        return wrappers;
    }

    function cleanPoloOptionalLabels() {
        ['doc-type', 'doc-number', 'birth-date', 'invoice-ruc', 'razon-social'].forEach(function (key) {
            var input = document.querySelector('[id*="' + key + '"]');
            if (!input) return;
            // Walk up max 4 levels to find a label
            var el = input;
            for (var i = 0; i < 4; i++) {
                el = el.parentElement;
                if (!el) break;
                var label = el.querySelector('label');
                if (label) {
                    label.textContent = label.textContent.replace(/\s*\(opcional\)/gi, '').trim();
                    break;
                }
            }
            // Clean placeholder option text in select
            if (input.tagName === 'SELECT') {
                Array.from(input.options).forEach(function (opt) {
                    opt.text = opt.text.replace(/\s*\(opcional\)/gi, '').trim();
                });
            }
        });
    }

    /* ── Logged-in checkout summary ─────────────────────────────────────── */

    var summaryConfig = {}; // stepId → { lines, expanded }

    function injectSummaryStyles() {
        if (document.getElementById('popolo-summary-styles')) return;
        var style = document.createElement('style');
        style.id = 'popolo-summary-styles';
        style.textContent = [
            '.popolo-step-collapsed > .wc-block-components-checkout-step__heading-container { display: none !important; }',
            '.popolo-step-collapsed > .wc-block-components-checkout-step__content           { display: none !important; }',
            '.popolo-step-summary { padding: 4px 0 12px; font-size: 14px; line-height: 1.8; color: #333; }',
            '.popolo-step-summary .popolo-edit-btn { display: inline; margin-top: 4px; padding: 0;',
            '  font-size: 14px; background: none; border: none; cursor: pointer;',
            '  color: #555; text-decoration: underline; }',
            '.popolo-step-summary .popolo-edit-btn:hover { color: #111; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function applyCollapse(stepId) {
        var cfg = summaryConfig[stepId];
        if (!cfg || cfg.expanded) return;

        var step = document.getElementById(stepId);
        if (!step) return;

        // Hide the entire step (heading + content) via class on the step itself
        step.classList.add('popolo-step-collapsed');

        // Place summary immediately before the step container (outside React's subtree)
        var summaryId = 'popolo-summary-' + stepId;
        if (!document.getElementById(summaryId)) {
            var summary = document.createElement('div');
            summary.id = summaryId;
            summary.className = 'popolo-step-summary';
            summary.innerHTML = cfg.lines.join('<br>') +
                '<br><button class="popolo-edit-btn" type="button">Editar</button>';
            step.parentNode.insertBefore(summary, step);

            summary.querySelector('.popolo-edit-btn').addEventListener('click', function () {
                cfg.expanded = true;
                step.classList.remove('popolo-step-collapsed');
                summary.remove();
            });
        }
    }

    function initLoggedInSummary() {
        if (!popoloLoyalty.userLoggedIn) return;

        injectSummaryStyles();

        var attempts = 0;
        var check = setInterval(function () {
            var email     = (document.querySelector('#email') || {}).value || '';
            var firstName = (document.querySelector('#shipping-first_name') || {}).value || '';

            if (email || firstName || ++attempts >= 25) {
                clearInterval(check);

                // Contact step: logged-in user — hide entirely, no summary needed
                var contactStep = document.getElementById('contact-fields');
                if (contactStep) contactStep.classList.add('popolo-step-collapsed');

                var lastName = (document.querySelector('#shipping-last_name') || {}).value || '';
                var address  = (document.querySelector('#shipping-address_1') || {}).value || '';
                var city     = (document.querySelector('#shipping-city') || {}).value || '';
                var phone    = (document.querySelector('#shipping-phone') || {}).value || '';

                if (firstName && address) {
                    var lines = ['<strong>' + esc((firstName + ' ' + lastName).trim()) + '</strong>'];
                    if (address) lines.push(esc(address));
                    if (city)    lines.push(esc(city));
                    if (phone)   lines.push('☎ ' + esc(phone));
                    summaryConfig['shipping-fields'] = { lines: lines, expanded: false };
                }

                // Apply summary for shipping step
                Object.keys(summaryConfig).forEach(applyCollapse);

                var obs = new MutationObserver(function () {
                    // Keep contact-fields hidden
                    var cs = document.getElementById('contact-fields');
                    if (cs && !cs.classList.contains('popolo-step-collapsed')) {
                        cs.classList.add('popolo-step-collapsed');
                    }
                    // Keep shipping summary collapsed
                    Object.keys(summaryConfig).forEach(function (stepId) {
                        var cfg = summaryConfig[stepId];
                        if (cfg && !cfg.expanded) {
                            var step = document.getElementById(stepId);
                            if (step && !step.classList.contains('popolo-step-collapsed')) {
                                step.classList.add('popolo-step-collapsed');
                            }
                        }
                    });
                });
                obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            }
        }, 300);
    }

    function patchLoginPrompt() {
        var link = document.querySelector('a.wc-block-checkout__login-prompt');
        if (link && link.textContent.trim() !== 'Iniciar sesión') {
            link.textContent = 'Iniciar sesión';
        }
    }

    function patchCreateAccountLabel() {
        var spans = document.querySelectorAll('.wc-block-components-checkbox__label');
        for (var i = 0; i < spans.length; i++) {
            var t = spans[i].textContent;
            if (t.indexOf('Crear una cuenta con') !== -1 || t.indexOf('Create an account with') !== -1) {
                spans[i].textContent = '🎁 Regístrate y únete a Popolo Rewards para ganar cupones y beneficios';
            }
        }
    }

    /* ── Textos/íconos estáticos que WooCommerce renderiza en inglés/genérico ─
       Todas idempotentes (chequean el texto/estado actual antes de tocar
       nada), así que correrlas de nuevo en cada mutación del DOM es seguro —
       no hay loop posible, una vez patcheado el texto ya no matchea la
       condición y no se vuelve a tocar. */

    function patchContactStepTitle() {
        var titles = document.querySelectorAll('.wc-block-components-checkout-step__title');
        for (var i = 0; i < titles.length; i++) {
            if (titles[i].textContent.trim() === 'Información de contacto') {
                titles[i].textContent = 'Datos Personales';
            }
        }
    }

    function patchShippingToggleLabels() {
        var opts = document.querySelectorAll('.wc-block-checkout__shipping-method-option-title');
        for (var i = 0; i < opts.length; i++) {
            var t = opts[i].textContent.trim();
            if (t === 'Enviar') {
                opts[i].textContent = 'Delivery';
            } else if (t === 'Recogida') {
                opts[i].textContent = 'Recojo en tienda';
            }
        }
    }

    // Ícono de moto + caja de pizza en vez del genérico de WooCommerce —
    // solo en la opción de envío a domicilio (Delivery/Enviar), no en la de
    // recojo en tienda.
    var DELIVERY_ICON_SVG = '<circle cx="5" cy="18" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/>'
        + '<path d="M5 18h2.5l2-6h3.2"/><path d="M9.5 12h2l1.3 3.2"/>'
        + '<rect x="13.5" y="8.5" width="6" height="6" rx="1"/>'
        + '<path d="M15.2 8.5V7a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5"/>'
        + '<path d="M15.2 11.2h3.6"/><path d="M15.2 12.9h3.6"/>';

    function patchDeliveryIcon() {
        var icons = document.querySelectorAll('.wc-block-checkout__shipping-method-option-icon');
        for (var i = 0; i < icons.length; i++) {
            var svg = icons[i];
            if (svg.dataset.popoloPatched) continue;
            var wrapper = svg.closest('.wc-block-checkout__shipping-method-option-title-wrapper');
            var titleEl = wrapper && wrapper.querySelector('.wc-block-checkout__shipping-method-option-title');
            var label = titleEl ? titleEl.textContent.trim() : '';
            if (label === 'Delivery' || label === 'Enviar') {
                svg.innerHTML = DELIVERY_ICON_SVG;
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.setAttribute('stroke-linecap', 'round');
                svg.setAttribute('stroke-linejoin', 'round');
                svg.dataset.popoloPatched = '1';
            }
        }
    }

    // Dropdown de sede para "Recojo en tienda" — reemplaza visualmente la
    // sección nativa "Ubicaciones de recogida" de WC Blocks (hoy solo tiene
    // 1 local genérico placeholder, oculto vía CSS). Coordenadas reales de
    // cada sede (mismas que usa popolo-app-theme para "distancia real al
    // local" en el home, ver functions.php de ese repo) — con eso se puede
    // calcular metros reales y armar el link de "Cómo llegar" a pie.
    var PICKUP_SEDES = [
        { value: 'miraflores', label: 'Popolo Miraflores', lat: -12.1220859, lng: -77.032755 },
        { value: 'sanisidro',  label: 'Popolo San Isidro',  lat: -12.0999158, lng: -77.0367056 },
        { value: 'chacarilla', label: 'Popolo Chacarilla',  lat: -12.1106877, lng: -76.9876609 }
    ];

    // Ubicación del cliente (geolocalización del navegador) — se pide una
    // sola vez por carga de página y se reusa para cualquier sede que elija
    // en el dropdown. Mismo patrón/margen de error que
    // requestGeolocation()/haversineKm() del store Alpine en
    // popolo-app-theme/functions.php, pero en JS plano (este archivo no
    // corre en el contexto de Alpine) y en metros en vez de km.
    var _userCoords = null; // {lat, lng} | null
    var _geoRequested = false;

    function haversineMeters(lat1, lon1, lat2, lon2) {
        var R = 6371000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function requestUserLocation(callback) {
        if (_userCoords) { callback(_userCoords); return; }
        if (_geoRequested || !navigator.geolocation) { callback(null); return; }
        _geoRequested = true;
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                _userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                callback(_userCoords);
            },
            function () { callback(null); },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
        );
    }

    function isPickupModeSelected() {
        var opts = document.querySelectorAll('.wc-block-checkout__shipping-method-option');
        for (var i = 0; i < opts.length; i++) {
            var titleEl = opts[i].querySelector('.wc-block-checkout__shipping-method-option-title');
            var label = titleEl ? titleEl.textContent.trim() : '';
            if (label === 'Recojo en tienda' && opts[i].classList.contains('wc-block-checkout__shipping-method-option--selected')) {
                return true;
            }
        }
        return false;
    }

    function renderPickupSedeSelector() {
        var fieldset = document.querySelector('.wp-block-woocommerce-checkout-shipping-method-block');
        var existing = document.getElementById('popolo-pickup-sede');

        if (!fieldset || !isPickupModeSelected()) {
            if (existing) existing.remove();
            return;
        }

        if (existing) return; // ya insertado — no reconstruir para no perder la selección del usuario

        var wrap = document.createElement('div');
        wrap.id = 'popolo-pickup-sede';
        wrap.className = 'popolo-pickup-sede';

        var selectId = 'popolo-pickup-sede-select-field';
        var label = document.createElement('label');
        label.className = 'popolo-pickup-sede__label';
        label.htmlFor = selectId;
        label.textContent = 'Selecciona tu tienda';

        var select = document.createElement('select');
        select.id = selectId;
        select.className = 'popolo-pickup-sede__select';

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecciona una tienda';
        placeholder.selected = true;
        placeholder.disabled = true;
        select.appendChild(placeholder);

        PICKUP_SEDES.forEach(function (sede) {
            var opt = document.createElement('option');
            opt.value = sede.value;
            opt.textContent = sede.label;
            select.appendChild(opt);
        });

        var distance = document.createElement('span');
        distance.id = 'popolo-pickup-distance';
        distance.className = 'popolo-pickup-sede__distance';
        distance.style.display = 'none';

        var link = document.createElement('a');
        link.id = 'popolo-pickup-maps-link';
        link.className = 'popolo-pickup-sede__maps-link';
        link.textContent = 'Cómo llegar';
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.display = 'none';

        select.addEventListener('change', function () {
            var chosen = null;
            for (var i = 0; i < PICKUP_SEDES.length; i++) {
                if (PICKUP_SEDES[i].value === select.value) { chosen = PICKUP_SEDES[i]; break; }
            }
            if (!chosen) {
                link.style.display = 'none';
                distance.style.display = 'none';
                return;
            }

            // El link funciona igual sin geolocalización (Maps arranca la ruta
            // desde la ubicación actual del dispositivo por su cuenta) — la
            // distancia en metros es el único dato que sí depende de que el
            // navegador haya dado permiso.
            link.href = 'https://www.google.com/maps/dir/?api=1&destination=' + chosen.lat + ',' + chosen.lng + '&travelmode=walking';
            link.style.display = 'inline-block';
            distance.style.display = 'none';

            requestUserLocation(function (coords) {
                if (!coords || select.value !== chosen.value) return; // el usuario ya cambió de sede
                link.href = 'https://www.google.com/maps/dir/?api=1&origin=' + coords.lat + ',' + coords.lng
                    + '&destination=' + chosen.lat + ',' + chosen.lng + '&travelmode=walking';
                var meters = haversineMeters(coords.lat, coords.lng, chosen.lat, chosen.lng);
                distance.textContent = 'Estás a ' + Math.round(meters) + ' mts.';
                distance.style.display = 'inline-block';
            });
        });

        wrap.appendChild(label);
        wrap.appendChild(select);
        var linkRow = document.createElement('div');
        linkRow.className = 'popolo-pickup-sede__link-row';
        linkRow.appendChild(distance);
        linkRow.appendChild(link);
        wrap.appendChild(linkRow);

        fieldset.insertAdjacentElement('afterend', wrap);
    }

    // Dropdown de Distrito (dirección de envío) — cada sede atiende un set
    // fijo de distritos. Al elegir uno, se muestra debajo un texto sutil con
    // la sede de preparación. El campo shipping_city sigue siendo la fuente
    // de verdad de la dirección real.
    //
    // Multisede (2026-07-10, pedido de Carlos): el dropdown SIEMPRE muestra
    // los 11 distritos, en cualquier sitio — un cliente puede entrar directo
    // a la subtienda de una sede (link, bookmark, Google) y en realidad
    // necesitar pedir a otra zona (ej. vive en Miraflores pero pide a su
    // trabajo en San Borja). Si el distrito elegido pertenece a una sede
    // DISTINTA a la actual, se dispara el mismo mecanismo de traspaso que ya
    // usa el bottom-sheet del sitio raíz (`popolo_sede_handoff`, ver
    // class-handoff.php en popolo-multisede) — el carrito y los cupones
    // viajan solos y el navegador redirige a la sede correcta. Invisible
    // salvo por el cambio de dominio en la URL (mismo trade-off ya aceptado
    // para el flujo del raíz).
    var DISTRITO_SEDE = {
        'Miraflores':   'Popolo Miraflores',
        'Surquillo':    'Popolo Miraflores',
        'Barranco':     'Popolo Miraflores',
        'Chorrillos':   'Popolo Miraflores',
        'San Isidro':   'Popolo San Isidro',
        'Lince':        'Popolo San Isidro',
        'Magdalena':    'Popolo San Isidro',
        'Jesús María':  'Popolo San Isidro',
        'San Borja':    'Popolo Chacarilla',
        'Surco':        'Popolo Chacarilla',
        'La Molina':    'Popolo Chacarilla'
    };
    var SEDE_ORDER = ['Popolo Miraflores', 'Popolo San Isidro', 'Popolo Chacarilla'];

    function setNativeValue(el, value) {
        var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value') &&
                            Object.getOwnPropertyDescriptor(proto, 'value').set;
        if (nativeSetter) { nativeSetter.call(el, value); } else { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function renderDistritoDropdown() {
        var cityInput = document.getElementById('shipping-city');
        var existing  = document.getElementById('popolo-distrito-select');

        if (!cityInput) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return; // ya insertado — no reconstruir

        var wrapperCell = cityInput.closest('.wc-block-components-address-form__city');
        if (!wrapperCell) return;

        var wrap = document.createElement('div');
        wrap.id = 'popolo-distrito-select';

        var selectId = 'popolo-distrito-select-field';
        var label = document.createElement('label');
        label.className = 'popolo-distrito-select__label';
        label.htmlFor = selectId;
        label.textContent = 'Distrito';

        var select = document.createElement('select');
        select.id = selectId;
        select.className = 'popolo-distrito-select__select';

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecciona tu distrito';
        placeholder.disabled = true;
        select.appendChild(placeholder);

        var bySede = {};
        for (var distrito in DISTRITO_SEDE) {
            var sede = DISTRITO_SEDE[distrito];
            if (!bySede[sede]) bySede[sede] = [];
            bySede[sede].push(distrito);
        }
        SEDE_ORDER.forEach(function (sede) {
            if (!bySede[sede] || !bySede[sede].length) return;
            var group = document.createElement('optgroup');
            group.label = sede;
            (bySede[sede] || []).forEach(function (distrito) {
                var opt = document.createElement('option');
                opt.value = distrito;
                opt.textContent = distrito;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });

        var note = document.createElement('p');
        note.id = 'popolo-distrito-sede-note';
        note.className = 'popolo-distrito-select__note';
        note.style.display = 'none';

        var currentValue = cityInput.value.trim();
        if (currentValue && DISTRITO_SEDE[currentValue]) {
            select.value = currentValue;
            note.textContent = 'Se prepara en ' + DISTRITO_SEDE[currentValue];
            note.style.display = 'block';
        } else {
            placeholder.selected = true;
        }

        select.addEventListener('change', function () {
            var sede = DISTRITO_SEDE[select.value];
            setNativeValue(cityInput, select.value);
            if (sede) {
                note.textContent = 'Se prepara en ' + sede;
                note.style.display = 'block';
            } else {
                note.style.display = 'none';
            }
            maybeHandoffToSede(select.value, select, note);
        });

        wrap.appendChild(label);
        wrap.appendChild(select);
        wrap.appendChild(note);

        wrapperCell.appendChild(wrap);
    }

    /**
     * Si el distrito elegido pertenece a una sede distinta a la del sitio
     * actual, traspasa el carrito (mismo AJAX que usa el bottom-sheet del
     * raíz) y redirige. No-op en el sitio raíz (no tiene currentSede) y si
     * ya estamos en la sede correcta.
     */
    function maybeHandoffToSede(district, select, note) {
        var ms = window.popoloMultisede;
        if (!ms || !ms.currentSede || !district) return;

        var targetSlug = null;
        ms.sedes.forEach(function (s) {
            if ((s.districts || []).indexOf(district) !== -1) targetSlug = s.slug;
        });
        if (!targetSlug || targetSlug === ms.currentSede) return;

        select.disabled = true;
        note.textContent = 'Cambiando de tienda…';
        note.style.display = 'block';

        $.post(ms.ajaxUrl, {
            action:   'popolo_sede_handoff',
            nonce:    ms.nonce,
            mode:     'delivery',
            district: district
        })
        .done(function (res) {
            if (res && res.success && res.data && res.data.redirect) {
                window.location.href = res.data.redirect;
                return;
            }
            select.disabled = false; // carrito vacío u otro fallo — seguir localmente
        })
        .fail(function () {
            select.disabled = false;
        });
    }

    // "Recojo en tienda" no pide Dirección/Distrito (campos ocultos por CSS,
    // ver input.css) — pero WC Blocks los sigue exigiendo para dejar avanzar
    // el checkout (probado: no hay filtro PHP que se los relaje, a
    // diferencia de postcode/company/state). Se rellenan con un dummy fijo.
    //
    // ⚠️ Esto escribe contra la sesión real de WooCommerce (Store API
    // "update-customer" se dispara con el evento input), así que el dummy
    // queda "recordado" como dirección del cliente — y en modo Recojo, como
    // no existe un formulario de envío separado, WC Blocks manda ese MISMO
    // valor también como shipping_address. Sin limpieza, el siguiente
    // checkout (aunque sea un Delivery real) arrancaba con "Sin Dirección"
    // pre-cargado en el campo real de envío (bug 2026-07-08, orden de
    // prueba #1012491). Por eso class-checkout.php::sync_billing_to_shipping()
    // resetea la sesión (WC()->customer) apenas se guarda la orden — el
    // dummy vive en ESA orden nada más, nunca como default futuro.
    function fillDummyBillingAddress() {
        var shipExists = !!document.querySelector('.wp-block-woocommerce-checkout-shipping-address-block');
        if (shipExists) return; // Delivery: se sincroniza desde el envío, ver mirrorBillingFromShipping()
        ['billing-address_1', 'billing-city'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && !el.value) {
                setNativeValue(el, 'Sin Dirección');
            }
        });
    }

    // Delivery: "Dirección de facturación" está oculta por CSS pero el
    // bloque sigue en el DOM con sus campos "required" — WC Blocks valida
    // TODOS los campos requeridos del formulario al enviar, sin importar si
    // están visibles o no. Antes esto quedaba enmascarado por datos viejos
    // que ya tenían esos campos (de una sesión anterior); al limpiar la
    // sesión después de "Recojo en tienda" (reset_customer_session_after_pickup
    // en class-checkout.php) esos campos quedan realmente vacíos y bloquean
    // el checkout de Delivery con "introduce una dirección válida" (bug
    // encontrado 2026-07-08 al probar el fix anterior). Se sincroniza en
    // vivo billing ← shipping mientras el cliente completa el form — mismo
    // efecto final que sync_billing_to_shipping() en PHP, pero eso solo
    // corre DESPUÉS de que el checkout ya se pudo enviar.
    function mirrorBillingFromShipping() {
        var shipExists = !!document.querySelector('.wp-block-woocommerce-checkout-shipping-address-block');
        if (!shipExists) return; // Recojo: no hay envío que espejar
        var pairs = [
            ['shipping-first_name', 'billing-first_name'],
            ['shipping-last_name',  'billing-last_name'],
            ['shipping-address_1',  'billing-address_1'],
            ['shipping-address_2',  'billing-address_2'],
            ['shipping-city',       'billing-city'],
            ['shipping-phone',      'billing-phone']
        ];
        pairs.forEach(function (pair) {
            var src = document.getElementById(pair[0]);
            var dst = document.getElementById(pair[1]);
            if (src && dst && dst.value !== src.value) {
                setNativeValue(dst, src.value);
            }
        });
    }

    // Nombre/Apellidos/Teléfono → arriba, debajo del correo en "Datos
    // Personales" (pedido de Carlos, mismo lugar para Delivery y Recojo).
    // Los campos reales (shipping-* o billing-*, según el modo) siguen
    // siendo la fuente de verdad para la orden — se ocultan por CSS y este
    // campo propio les escribe el valor. Objetivo dinámico: en Delivery
    // escribe en shipping-* (que a su vez se espeja a billing-* por
    // mirrorBillingFromShipping); en Recojo, directo en billing-* (única
    // dirección que existe ahí).
    function getActiveNamePhoneTargets() {
        var shipExists = !!document.querySelector('.wp-block-woocommerce-checkout-shipping-address-block');
        var prefix = shipExists ? 'shipping' : 'billing';
        return {
            firstName: document.getElementById(prefix + '-first_name'),
            lastName:  document.getElementById(prefix + '-last_name'),
            phone:     document.getElementById(prefix + '-phone')
        };
    }

    function pushContactFieldsToTargets() {
        var fnInput = document.getElementById('popolo-contact-first_name');
        var lnInput = document.getElementById('popolo-contact-last_name');
        var phInput = document.getElementById('popolo-contact-phone');
        if (!fnInput) return;
        var targets = getActiveNamePhoneTargets();
        // Solo empuja valores NO vacíos — nunca pisar un dato real ya
        // guardado en el target con un campo propio todavía sin tipear.
        if (targets.firstName && fnInput.value && targets.firstName.value !== fnInput.value) {
            setNativeValue(targets.firstName, fnInput.value);
        }
        if (targets.lastName && lnInput.value && targets.lastName.value !== lnInput.value) {
            setNativeValue(targets.lastName, lnInput.value);
        }
        if (targets.phone && phInput.value && targets.phone.value !== phInput.value) {
            setNativeValue(targets.phone, phInput.value);
        }
    }

    function renderPersonalContactFields() {
        var emailWrapper = document.querySelector('.wc-block-components-address-form__email');
        var existing = document.getElementById('popolo-contact-name-fields');
        if (!emailWrapper) return;

        if (!existing) {
            var wrap = document.createElement('div');
            wrap.id = 'popolo-contact-name-fields';
            wrap.className = 'popolo-contact-name-fields';

            function makeField(id, label, autocomplete, extraClass) {
                var group = document.createElement('div');
                group.className = 'popolo-contact-name-fields__field' + (extraClass ? ' ' + extraClass : '');
                var lbl = document.createElement('label');
                lbl.className = 'popolo-contact-name-fields__label';
                lbl.setAttribute('for', id);
                lbl.textContent = label;
                var input = document.createElement('input');
                input.type = 'text';
                input.id = id;
                input.className = 'popolo-contact-name-fields__input';
                input.autocomplete = autocomplete;
                group.appendChild(lbl);
                group.appendChild(input);
                return group;
            }

            wrap.appendChild(makeField('popolo-contact-first_name', 'Nombre', 'given-name'));
            wrap.appendChild(makeField('popolo-contact-last_name', 'Apellido', 'family-name'));
            wrap.appendChild(makeField('popolo-contact-phone', 'Teléfono', 'tel', 'popolo-contact-name-fields__field--phone'));

            emailWrapper.insertAdjacentElement('afterend', wrap);

            // Precarga desde el campo real activo si ya tenía datos (sesión previa)
            var targets = getActiveNamePhoneTargets();
            var fnInput = document.getElementById('popolo-contact-first_name');
            var lnInput = document.getElementById('popolo-contact-last_name');
            var phInput = document.getElementById('popolo-contact-phone');
            if (targets.firstName && targets.firstName.value) fnInput.value = targets.firstName.value;
            if (targets.lastName && targets.lastName.value) lnInput.value = targets.lastName.value;
            if (targets.phone && targets.phone.value) phInput.value = targets.phone.value;

            [fnInput, lnInput, phInput].forEach(function (input) {
                input.addEventListener('input', pushContactFieldsToTargets);
            });
        }

        pushContactFieldsToTargets();
    }

    // "Deseo factura" — checkbox + RUC/Razón Social colapsados por defecto.
    // Mismo patrón que setPoloFieldsVisible() (wrappers ocultos por CSS
    // inline + limpieza del valor en el store al ocultar, porque WC Blocks
    // valida campos ocultos igual que los visibles).
    function findInvoiceFieldWrappers() {
        var wrappers = [];
        document.querySelectorAll('[data-popolo-invoice-field]').forEach(function (input) {
            var wrapper = input.closest('.wc-block-components-text-input') ||
                          (input.parentElement && input.parentElement.parentElement);
            if (wrapper) wrappers.push(wrapper);
        });
        return wrappers;
    }

    function findInvoiceCheckbox() {
        return document.querySelector('[id*="wants-invoice"]') ||
               document.querySelector('[name*="wants-invoice"]');
    }

    function setInvoiceFieldsVisible(visible) {
        findInvoiceFieldWrappers().forEach(function (w) {
            w.style.display = visible ? '' : 'none';
        });
        if (!visible && wp.data && wp.data.dispatch) {
            wp.data.dispatch('wc/store/checkout').setAdditionalFields({
                'popolo-invoice/ruc':          '',
                'popolo-invoice/razon-social': '',
            });
        }
    }

    var lastInvoiceState = null;

    // Aplica visibilidad/flecha ya conociendo el estado (checked) — separado
    // de syncInvoiceFields() para poder llamarlo DIRECTO desde el evento
    // 'change' del checkbox, sin esperar a que el store de Redux confirme el
    // valor (ver comentario en patchInvoiceArrow: leer el store en el mismo
    // tick del click puede devolver el valor viejo, y esperar al próximo
    // MutationObserver genérico metía un delay perceptible).
    function applyInvoiceVisibility(wants, checkbox) {
        lastInvoiceState = wants;
        setInvoiceFieldsVisible(wants);
        var wrap = checkbox && checkbox.closest('.wc-block-components-checkbox');
        if (wrap) wrap.classList.toggle('popolo-invoice-arrow--open', wants);
    }

    function patchInvoiceArrow() {
        var checkbox = findInvoiceCheckbox();
        if (!checkbox) return;
        var wrap = checkbox.closest('.wc-block-components-checkbox');
        if (!wrap || wrap.querySelector('.popolo-invoice-arrow')) return;
        var arrow = document.createElement('span');
        arrow.className = 'popolo-invoice-arrow';
        arrow.innerHTML = '&#9662;'; // ▾
        wrap.appendChild(arrow);

        // Respuesta inmediata al click — no depender del MutationObserver
        // genérico (childList/subtree, no dispara con solo el checked del
        // checkbox) ni de esperar que el store de checkout se actualice.
        checkbox.addEventListener('change', function () {
            applyInvoiceVisibility(checkbox.checked, checkbox);
        });
    }

    // Red de seguridad: si React vuelve a renderizar el checkbox (nuevo nodo,
    // sin el listener de arriba) o el toggle ocurrió por otra vía, esto
    // corrige la visibilidad leyendo el store real — corre en cada tick del
    // MutationObserver general, igual que el resto de patchStaticTexts().
    function syncInvoiceFields() {
        if (!wp.data || !wp.data.select) return;
        var coStore = wp.data.select('wc/store/checkout');
        if (!coStore || !coStore.getAdditionalFields) return;
        var fields = coStore.getAdditionalFields() || {};
        var wants  = !!fields['popolo-invoice/wants-invoice'];
        if (wants === lastInvoiceState) return;
        applyInvoiceVisibility(wants, findInvoiceCheckbox());
    }

    function patchStaticTexts() {
        patchShippingToggleLabels();
        patchDeliveryIcon();
        patchContactStepTitle();
        renderPickupSedeSelector();
        renderDistritoDropdown();
        fillDummyBillingAddress();
        mirrorBillingFromShipping();
        renderPersonalContactFields();
        patchInvoiceArrow();
        syncInvoiceFields();
    }

    function setPoloFieldsVisible(visible) {
        var wrappers = findPoloFieldWrappers();
        wrappers.forEach(function (w) {
            w.style.display = visible ? '' : 'none';
        });

        // Al ocultarlos (invitado, no crea cuenta) hay que limpiar el valor
        // en el store de checkout, no solo esconder el input: WC Blocks
        // inicializa estos campos en "0" (no en '""'), y "0" no es una de
        // las opciones válidas del select (doc-type) — el pedido se
        // rechazaba con "popolo-loyalty/doc-type no es uno de , DNI, CE,
        // Pasaporte y ." aunque el campo esté oculto y sea opcional.
        if (!visible && wp.data && wp.data.dispatch) {
            wp.data.dispatch('wc/store/checkout').setAdditionalFields({
                'popolo-loyalty/doc-type':   '',
                'popolo-loyalty/doc-number': '',
                'popolo-loyalty/birth-date': '',
            });
        }
    }

    function initBlockCheckout() {
        // Inject widget container above the checkout block
        var $block = $('.wp-block-woocommerce-checkout');
        if (!$block.length) return;

        $widget = $('<div id="popolo-points-widget" class="woocommerce-info" style="display:none;margin-bottom:16px;"></div>');
        $block.before($widget);

        if (typeof wp !== 'undefined' && wp.data) {
            var lastCreateAccount = null;
            var lastEmail2 = '';

            wp.data.subscribe(function () {
                // Email lookup
                var cartStore = wp.data.select('wc/store/cart');
                if (cartStore && cartStore.getCustomerData) {
                    var billing = cartStore.getCustomerData().billingAddress || {};
                    onEmail(billing.email || '');
                }

                // Show/hide loyalty fields based on create account checkbox
                var coStore = wp.data.select('wc/store/checkout');
                if (!coStore) return;
                var shouldCreate = coStore.getShouldCreateAccount ? coStore.getShouldCreateAccount() : false;
                if (shouldCreate === lastCreateAccount) return;
                lastCreateAccount = shouldCreate;
                setPoloFieldsVisible(shouldCreate);
            });

            // Hide fields by default on first render (MutationObserver waits for React)
            var labelsClean = false;
            var lastShouldCreate = null;

            var observer = new MutationObserver(function () {
                var wrappers = findPoloFieldWrappers();
                if (!wrappers.length) return;

                var coStore = wp.data.select('wc/store/checkout');
                var shouldCreate = coStore && coStore.getShouldCreateAccount ? coStore.getShouldCreateAccount() : false;

                observer.disconnect();

                if (!labelsClean) {
                    cleanPoloOptionalLabels();
                    labelsClean = true;
                }

                patchCreateAccountLabel();
                patchLoginPrompt();

                // Always enforce visibility — React re-renders create new DOM elements
                // that lose the inline style, so we can't skip based on lastShouldCreate.
                setPoloFieldsVisible(shouldCreate);
                lastShouldCreate = shouldCreate;

                observer.observe(document.body, { childList: true, subtree: true });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Patch create-account label and login prompt after React finishes initial render
        setTimeout(patchCreateAccountLabel, 800);
        setTimeout(patchLoginPrompt, 800);

        // Textos/íconos estáticos (título "Datos Personales", toggle
        // Delivery/Recojo en tienda, ícono de moto): observer propio y
        // continuo — a diferencia de los campos de lealtad, estos no
        // dependen de que el usuario tilde "crear cuenta", tienen que
        // patchearse siempre que React vuelva a renderizar esa parte del
        // formulario.
        patchStaticTexts();
        new MutationObserver(patchStaticTexts).observe(document.body, { childList: true, subtree: true });

        // Pre-fill summary for logged-in users
        initLoggedInSummary();

        // Auto-load for logged-in users
        if (popoloLoyalty.userLoggedIn && popoloLoyalty.currentEmail) {
            lastEmail = popoloLoyalty.currentEmail;
            lookupPoints(popoloLoyalty.currentEmail);
        }
    }

    /* ── Classic checkout integration ────────────────────────────────────── */

    function initClassicCheckout() {
        $widget = $('#popolo-points-widget');

        // Auto-load for logged-in users
        if (popoloLoyalty.userLoggedIn && popoloLoyalty.currentEmail) {
            lastEmail = popoloLoyalty.currentEmail;
            lookupPoints(popoloLoyalty.currentEmail);
        }

        // Listen to billing email input
        $(document).on('input change', '#billing_email', function () {
            onEmail($(this).val());
        });
    }

    /* ── Thank-you page ──────────────────────────────────────────────────── */

    function loadThankyouPoints() {
        var $ty = $('#popolo-thankyou-points');
        if (!$ty.length) return;
        var email = $ty.data('email');
        if (!email) return;

        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found) {
                var pts = data.total_points || 0;
                $ty.html(
                    '🎁 ¡Gracias por tu compra, <strong>' + esc(data.partner_name) + '</strong>!'
                    + ' Ahora tienes <strong>' + fmt(pts) + ' puntos</strong> de lealtad.'
                ).slideDown(300);
            }
        });
    }

    /* ── Init ────────────────────────────────────────────────────────────── */

    $(function () {
        isBlockCO = !!document.querySelector('.wp-block-woocommerce-checkout');

        if (isBlockCO) {
            initBlockCheckout();
        } else if (popoloLoyalty.page === 'checkout') {
            // Solo checkout clásico real (sin bloque WC) cae acá. En la página
            // /cart/ del theme app (que no usa el bloque Cart ni el clásico)
            // popoloLoyalty.page === 'cart', así que no dispara una búsqueda
            // de puntos que no tiene dónde mostrarse.
            initClassicCheckout();
        }

        loadThankyouPoints();
    });

}(jQuery));
