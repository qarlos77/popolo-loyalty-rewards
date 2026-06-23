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
        ['doc-type', 'doc-number', 'birth-date'].forEach(function (key) {
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
            '.popolo-step-summary .popolo-edit-btn { display: inline-block; margin-top: 6px; padding: 5px 14px;',
            '  font-size: 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px;',
            '  cursor: pointer; color: #555; }',
            '.popolo-step-summary .popolo-edit-btn:hover { border-color: #999; color: #111; }'
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
                '<br><button class="popolo-edit-btn" type="button">✏ Editar</button>';
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
        if (link && link.textContent.trim() !== '¿Ya tienes cuenta? Inicia sesión') {
            link.textContent = '¿Ya tienes cuenta? Inicia sesión';
        }
    }

    function patchCreateAccountLabel() {
        var spans = document.querySelectorAll('.wc-block-components-checkbox__label');
        for (var i = 0; i < spans.length; i++) {
            var t = spans[i].textContent;
            if (t.indexOf('Crear una cuenta con') !== -1 || t.indexOf('Create an account with') !== -1) {
                spans[i].textContent = 'Regístrate y únete a Popolo Rewards para ganar cupones y beneficios';
            }
        }
    }

    function setPoloFieldsVisible(visible) {
        var wrappers = findPoloFieldWrappers();
        wrappers.forEach(function (w) {
            w.style.display = visible ? '' : 'none';
        });
    }

    function initBlockCheckout() {
        // Inject widget container above the checkout block
        var $block = $('.wp-block-woocommerce-checkout');
        if (!$block.length) return;

        $widget = $('<div id="popolo-points-widget" class="woocommerce-info" style="display:none;margin-bottom:16px;"></div>');
        $block.before($widget);

        if (typeof wp !== 'undefined' && wp.data) {
            // Override default shipping: select Delivery (flat_rate:1) if pickup is selected
            (function trySetDefaultShipping(attempts) {
                var cartStore = wp.data.select('wc/store/cart');
                if (!cartStore) { if (attempts < 30) setTimeout(function(){ trySetDefaultShipping(attempts + 1); }, 300); return; }
                var rates = cartStore.getCartData && cartStore.getCartData().shippingRates;
                if (!rates || !rates.length) { if (attempts < 30) setTimeout(function(){ trySetDefaultShipping(attempts + 1); }, 300); return; }
                var pkg = rates[0];
                var selected = pkg && pkg.shipping_rates && pkg.shipping_rates.find(function(r){ return r.selected; });
                if (selected && selected.rate_id !== 'flat_rate:1') {
                    wp.data.dispatch('wc/store/cart').selectShippingRate('flat_rate:1', pkg.package_id || 0);
                }
            })(0);

            // Override default state: LIM (Lima Provincias) → LMA (Lima Metropolitana)
            (function trySetDefaultState(attempts) {
                var sel = document.querySelector('select[id*="state"]');
                if (!sel) {
                    if (attempts < 30) setTimeout(function(){ trySetDefaultState(attempts + 1); }, 300);
                    return;
                }
                if (sel.value === 'LIM' || sel.value === '') {
                    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value') &&
                                       Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                    if (nativeSetter) { nativeSetter.call(sel, 'LMA'); }
                    else { sel.value = 'LMA'; }
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            })(0);

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

        // Pre-fill summary for logged-in users
        initLoggedInSummary();

        // Auto-load for logged-in users
        if (popoloLoyalty.userLoggedIn && popoloLoyalty.currentEmail) {
            lastEmail = popoloLoyalty.currentEmail;
            lookupPoints(popoloLoyalty.currentEmail);
        }
    }

    /* ── Cart page integration ───────────────────────────────────────────── */

    function initCartPage() {
        var $banner = $('.popolo-cart-rewards-banner');
        if (!$banner.length) return;

        var ratio = parseFloat($banner.data('ratio') || 0);
        if (!ratio) return;

        function updateBannerPoints() {
            var cartStore = wp.data && wp.data.select('wc/store/cart');
            if (!cartStore) return false;
            var totals = cartStore.getCartTotals ? cartStore.getCartTotals() : null;
            if (!totals) return false;

            // total_items = product subtotal only (excludes shipping, fees, taxes)
            var unit     = Math.pow(10, parseInt(totals.currency_minor_unit || 2, 10));
            var subtotal = parseInt(totals.total_items || 0, 10) / unit;
            if (!subtotal) return false;

            var points = Math.floor(subtotal * ratio);
            if (points > 0) {
                $banner.find('.popolo-cart-points-placeholder').html(
                    '<strong>' + points.toLocaleString('es-PE') + ' puntos</strong>'
                );
                $banner.html(
                    $banner.html().replace(
                        '¡Con esta compra puedes acumular',
                        'Con esta compra acumularías'
                    ).replace(
                        ' y bonos de bienvenida!',
                        ' ¡más bonos de bienvenida!'
                    )
                );
            }
            return true;
        }

        // Try immediately, then retry until the store has data
        var attempts = 0;
        var interval = setInterval(function () {
            if (updateBannerPoints() || ++attempts >= 20) {
                clearInterval(interval);
            }
        }, 300);
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

        if (document.querySelector('.wp-block-woocommerce-cart')) {
            initCartPage();
        } else if (isBlockCO) {
            initBlockCheckout();
        } else {
            initClassicCheckout();
        }

        loadThankyouPoints();
    });

}(jQuery));
