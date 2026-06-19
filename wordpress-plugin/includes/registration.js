(function ($) {
    'use strict';

    function showMessage(msg, type) {
        var cssClass = type === 'success' ? 'success'
                     : type === 'info'    ? 'info'
                     :                      'error';
        $('#popolo-register-message')
            .removeClass('success info error')
            .addClass('popolo-register-msg ' + cssClass)
            .html(msg)
            .show();
        $('html, body').animate({ scrollTop: $('#popolo-register-message').offset().top - 80 }, 300);
    }

    function buildBirthDate() {
        var d = $('#loyalty_birth_day').val();
        var m = $('#loyalty_birth_month').val();
        var y = $('#loyalty_birth_year').val();
        if (!d || !m || !y) { return ''; }
        var val = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        $('#loyalty_birth_date').val(val);
        return val;
    }

    $(function () {
        $('#loyalty_birth_day, #loyalty_birth_month, #loyalty_birth_year').on('change', function () {
            buildBirthDate();
        });

        $('#popolo-register-form').on('submit', function (e) {
            e.preventDefault();

            var name       = $('#loyalty_name').val().trim();
            var lastname   = $('#loyalty_lastname').val().trim();
            var email      = $('#loyalty_email').val().trim();
            var phone      = $('#loyalty_phone').val().trim();
            var birth_date = buildBirthDate();

            if (!name || !email || !phone || !birth_date) {
                showMessage('Por favor completa los campos obligatorios (Nombre, Correo, Teléfono y Fecha de nacimiento).', 'error');
                return;
            }

            var $btn = $('#popolo-register-submit');
            $btn.prop('disabled', true).text('Procesando…');
            $('#popolo-register-message').hide();

            $.post(popoloRegistration.ajaxurl, {
                action:      'popolo_loyalty_register',
                _ajax_nonce: popoloRegistration.nonce,
                name:        name,
                lastname:    lastname,
                email:       email,
                phone:       phone,
                birth_date:  birth_date,
            })
            .done(function (data) {
                if (data.success) {
                    showMessage(data.message, 'success');
                    $('#popolo-register-form').slideUp(300);
                } else if (data.already_member) {
                    showMessage(data.message, 'info');
                    $btn.prop('disabled', false).text('Registrarme');
                } else {
                    showMessage(data.message || 'Ocurrió un error. Por favor intenta de nuevo.', 'error');
                    $btn.prop('disabled', false).text('Registrarme');
                }
            })
            .fail(function () {
                showMessage('Error de conexión. Por favor intenta de nuevo.', 'error');
                $btn.prop('disabled', false).text('Registrarme');
            });
        });
    });

}(jQuery));
