(function ($) {
    'use strict';

    var timer     = null;
    var lastEmail = '';

    function lookupPoints(email) {
        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            email:       email,
        })
        .done(function (data) {
            if (data && data.found) {
                showWidget(data.partner_name, data.total_points_display || data.total_points);
            } else {
                hideWidget();
            }
        })
        .fail(function () {
            hideWidget();
        });
    }

    function showWidget(name, points) {
        var msg = 'Hola <strong>' + esc(name) + '</strong> — tienes <strong>' + esc(points) + ' puntos</strong> de fidelidad acumulados.';
        $('#popolo-points-widget').html(msg).slideDown(250);
    }

    function hideWidget() {
        $('#popolo-points-widget').slideUp(200).html('');
    }

    function esc(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function isValidEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    $(function () {
        $(document).on('input change', '#billing_email', function () {
            var email = $(this).val().trim().toLowerCase();

            if (email === lastEmail) return;
            lastEmail = email;

            clearTimeout(timer);

            if (!isValidEmail(email)) {
                hideWidget();
                return;
            }

            timer = setTimeout(function () {
                lookupPoints(email);
            }, 700);
        });
    });
}(jQuery));
