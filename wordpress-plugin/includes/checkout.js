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

                // Only act if something actually needs to change
                if (labelsClean && shouldCreate === lastShouldCreate) return;

                observer.disconnect();

                if (!labelsClean) {
                    cleanPoloOptionalLabels();
                    labelsClean = true;
                }

                if (shouldCreate !== lastShouldCreate) {
                    setPoloFieldsVisible(shouldCreate);
                    lastShouldCreate = shouldCreate;
                }

                observer.observe(document.body, { childList: true, subtree: true });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

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
        } else {
            initClassicCheckout();
        }

        loadThankyouPoints();
    });

}(jQuery));
