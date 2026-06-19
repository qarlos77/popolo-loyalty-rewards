(function ($) {
    'use strict';

    var timer    = null;
    var lastPhone = '';

    function lookupPoints(phone) {
        $.post(popoloLoyalty.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloLoyalty.nonce,
            phone:       phone,
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
        var msg = '🍕 Hola <strong>' + esc(name) + '</strong> — tienes <strong>' + esc(points) + ' puntos</strong> de fidelidad acumulados.';
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

    $(function () {
        var fieldId = '#' + (popoloLoyalty.phone_field || 'billing_phone');

        $(document).on('input change', fieldId, function () {
            var digits = $(this).val().replace(/\D/g, '');

            if (digits === lastPhone) return;
            lastPhone = digits;

            clearTimeout(timer);

            if (digits.length < 7) {
                hideWidget();
                return;
            }

            timer = setTimeout(function () {
                lookupPoints(digits);
            }, 600);
        });
    });
}(jQuery));
