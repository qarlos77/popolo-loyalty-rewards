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

    function initBlockCheckout() {
        // Inject widget container above the checkout block
        var $block = $('.wp-block-woocommerce-checkout');
        if (!$block.length) return;

        $widget = $('<div id="popolo-points-widget" class="woocommerce-info" style="display:none;margin-bottom:16px;"></div>');
        $block.before($widget);

        // Listen for email changes via WooCommerce / wp.data store
        if (typeof wp !== 'undefined' && wp.data) {
            var unsubscribe = wp.data.subscribe(function () {
                var store = wp.data.select('wc/store/cart');
                if (!store || !store.getCustomerData) return;
                var billing = store.getCustomerData().billingAddress || {};
                onEmail(billing.email || '');
            });
            // Unsubscribe when user navigates away
            $(window).on('beforeunload', unsubscribe);
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
