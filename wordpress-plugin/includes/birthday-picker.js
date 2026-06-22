(function () {
    'use strict';

    // Placeholder light gray + select styling
    var s = document.createElement('style');
    s.textContent = '#reg_birth_date::placeholder,[data-popolo-birth]::placeholder{color:#757575;}'
                  + '.wc-blocks-components-select .wc-blocks-components-select__label{color:#757575;}'
                  + '#reg_doc_type option{color:#333;}'
                  + '#reg_doc_type{width:100%;box-sizing:border-box;}';
    document.head.appendChild(s);

    function format(val) {
        var d = val.replace(/\D/g, '').substring(0, 8);
        var r = '';
        if (d.length > 0) r  = d.substring(0, 2);
        if (d.length > 2) r += '/' + d.substring(2, 4);
        if (d.length > 4) r += '/' + d.substring(4, 8);
        return r;
    }

    // Native setter trick so React-controlled inputs accept our programmatic update
    var nativeSetter = Object.getOwnPropertyDescriptor &&
                       Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') &&
                       Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    function setValue(input, val) {
        if (nativeSetter) {
            nativeSetter.call(input, val);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            input.value = val;
        }
    }

    var busy = false;

    function initMask(input) {
        if (!input || input.dataset.maskInit) return;
        input.dataset.maskInit = '1';
        input.removeAttribute('readonly');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('maxlength', '10');

        input.addEventListener('input', function () {
            if (busy) return;
            var formatted = format(this.value);
            if (formatted === this.value) return;
            busy = true;
            setValue(this, formatted);
            busy = false;
            var end = formatted.length;
            try { this.setSelectionRange(end, end); } catch (e) {}
        });
    }

    function findCheckoutInput() {
        return document.querySelector('[data-popolo-birth]')      ||
               document.querySelector('input[autocomplete="bday"]') ||
               document.querySelector('input[id*="birth-date"]')    ||
               document.querySelector('input[name*="birth-date"]');
    }

    function tryInit() {
        // My Account registration form (classic PHP form)
        initMask(document.getElementById('reg_birth_date'));
        // Block checkout: WC renders input with data-popolo-birth="1"
        initMask(findCheckoutInput());
    }

    document.addEventListener('DOMContentLoaded', function () {
        tryInit();

        // Select doc type: gray when placeholder, black when value selected
        var docTypeSelect = document.getElementById('reg_doc_type');
        if (docTypeSelect) {
            docTypeSelect.style.color = '#757575';
            docTypeSelect.addEventListener('change', function () {
                this.style.color = this.value ? '#333' : '#757575';
            });
        }

        if (!document.querySelector('.wp-block-woocommerce-checkout')) return;

        // Strategy 1: MutationObserver reacts to every React DOM change
        new MutationObserver(tryInit).observe(document.body, { childList: true, subtree: true });

        // Strategy 2: periodic retry up to 15s as safety net
        var ticks = 0;
        var timer = setInterval(function () {
            tryInit();
            ticks++;
            // Stop polling once field is found and masked, or after 30 ticks (15s)
            if (ticks >= 30 || (findCheckoutInput() && findCheckoutInput().dataset.maskInit)) {
                clearInterval(timer);
            }
        }, 500);
    });
}());
