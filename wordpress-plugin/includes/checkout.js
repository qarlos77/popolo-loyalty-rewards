(function ($) {
    'use strict';

    var timer     = null;
    var lastEmail = '';

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

    /* ── Checkout widgets ─────────────────────────────────────────────────── */

    function showPointsWidget(name, points, ratio, cartTotal) {
        var earned = (ratio > 0 && cartTotal > 0) ? Math.floor(cartTotal * ratio) : 0;
        var after  = points + earned;

        var html = '🎁 Hola <strong>' + esc(name) + '</strong>'
                 + ' — tienes <strong>' + fmt(points) + ' puntos</strong>';

        if (earned > 0) {
            html += ' · esta compra suma <strong>+' + fmt(earned) + ' pts</strong>'
                  + ' · total: <strong>' + fmt(after) + ' pts</strong>';
        }

        $('#popolo-points-widget').html(html).slideDown(250);
        hideEnrollmentWidget();
    }

    function hidePointsWidget() {
        $('#popolo-points-widget').slideUp(200).html('');
    }

    function showEnrollmentWidget() {
        $('#popolo-enrollment-widget').slideDown(250);
    }

    function hideEnrollmentWidget() {
        $('#popolo-enrollment-widget').slideUp(200);
        $('#popolo_join_loyalty_checkbox').prop('checked', false);
        $('#popolo_join_loyalty').val('');
    }

    /* ── Points lookup ────────────────────────────────────────────────────── */

    function lookupPoints(email) {
        var cartTotal = parseFloat(popoloLoyalty.cartTotal || 0);

        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found && data.has_card) {
                var ratio = parseFloat(data.points_ratio || 0);
                showPointsWidget(data.partner_name, data.total_points || 0, ratio, cartTotal);
            } else if (data) {
                hidePointsWidget();
                showEnrollmentWidget();
            } else {
                hidePointsWidget();
                hideEnrollmentWidget();
            }
        })
        .fail(function () {
            hidePointsWidget();
            hideEnrollmentWidget();
        });
    }

    /* ── Thank-you page ───────────────────────────────────────────────────── */

    function loadThankyouPoints() {
        var $widget = $('#popolo-thankyou-points');
        if (!$widget.length) return;

        var email = $widget.data('email');
        if (!email) return;

        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found && data.has_card) {
                var pts = data.total_points || 0;
                $widget.html(
                    '🎁 ¡Gracias por tu compra, <strong>' + esc(data.partner_name) + '</strong>!'
                    + ' Ahora tienes <strong>' + fmt(pts) + ' puntos</strong> de lealtad.'
                ).slideDown(300);
            }
        });
    }

    /* ── Init ─────────────────────────────────────────────────────────────── */

    $(function () {
        // Auto-load for logged-in users
        if (popoloLoyalty.userLoggedIn && popoloLoyalty.currentEmail) {
            lastEmail = popoloLoyalty.currentEmail;
            lookupPoints(popoloLoyalty.currentEmail);
        }

        // Listen for billing email changes (guest / non-pre-filled)
        $(document).on('input change', '#billing_email', function () {
            var email = $(this).val().trim().toLowerCase();
            if (email === lastEmail) return;
            lastEmail = email;
            clearTimeout(timer);
            if (!isValidEmail(email)) {
                hidePointsWidget();
                hideEnrollmentWidget();
                return;
            }
            timer = setTimeout(function () { lookupPoints(email); }, 700);
        });

        // Enrollment checkbox
        $(document).on('change', '#popolo_join_loyalty_checkbox', function () {
            $('#popolo_join_loyalty').val($(this).is(':checked') ? '1' : '');
        });

        // Thank-you page
        loadThankyouPoints();
    });

}(jQuery));
