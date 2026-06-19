(function ($) {
    'use strict';

    var timer     = null;
    var lastEmail = '';

    /* ── Helpers ────────────────────────────────────────────────────────── */

    function esc(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isValidEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    /* ── Checkout widgets ───────────────────────────────────────────────── */

    function showPointsWidget(name, points) {
        var msg = 'Hola <strong>' + esc(name) + '</strong> — tienes <strong>'
            + esc(String(points)) + ' puntos</strong> de lealtad acumulados.';
        $('#popolo-points-widget').html(msg).slideDown(250);
        hideEnrollmentWidget();
    }

    function hidePointsWidget() {
        $('#popolo-points-widget').slideUp(200).html('');
    }

    function showEnrollmentWidget() {
        var pts  = parseInt(popoloLoyalty.welcomePoints || 0, 10);
        var text = 'Unirme al programa de lealtad y ganar puntos con esta compra';
        if (pts > 0) {
            text += ' (te regalamos ' + pts + ' puntos de bienvenida)';
        }
        $('#popolo-enrollment-text').text(text);
        $('#popolo-enrollment-widget').slideDown(250);
    }

    function hideEnrollmentWidget() {
        $('#popolo-enrollment-widget').slideUp(200);
        $('#popolo_join_loyalty_checkbox').prop('checked', false);
        $('#popolo_join_loyalty').val('');
    }

    /* ── Email lookup ───────────────────────────────────────────────────── */

    function lookupPoints(email) {
        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found && data.has_card) {
                showPointsWidget(data.partner_name, data.total_points_display || data.total_points);
            } else if (data) {
                // Found but no card, or not found at all — offer enrollment
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

    /* ── Thank-you page: show updated balance after order ───────────────── */

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
                var pts = data.total_points_display || data.total_points;
                var msg = '¡Gracias por tu compra, <strong>' + esc(data.partner_name) + '</strong>! '
                    + 'Ahora tienes <strong>' + esc(String(pts)) + ' puntos</strong> de lealtad.';
                $widget.html(msg).slideDown(300);
            }
        });
    }

    /* ── Init ───────────────────────────────────────────────────────────── */

    $(function () {
        // Checkout: listen for email changes
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

        // Checkout: checkbox toggles hidden field
        $(document).on('change', '#popolo_join_loyalty_checkbox', function () {
            $('#popolo_join_loyalty').val($(this).is(':checked') ? '1' : '');
        });

        // Thank-you page
        loadThankyouPoints();
    });

}(jQuery));
