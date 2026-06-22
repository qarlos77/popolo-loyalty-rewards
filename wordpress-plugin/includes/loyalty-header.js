(function ($) {
    'use strict';

    var CACHE_KEY = 'popolo_pts_cache';
    var CACHE_TTL = 5 * 60 * 1000; // 5 min

    function fmt(n) {
        return Number(n).toLocaleString('es-PE');
    }

    function injectGreeting(pts) {
        var $slot = $('.topbar-right-items');
        if (!$slot.length) return;

        var name = (popoloBadge.name || '').split(' ')[0];
        var ptsText = (pts !== null)
            ? ', tienes <strong>' + fmt(pts) + '&nbsp;pts</strong>&nbsp;acumulados'
            : '';

        var $el = $('<span id="popolo-topbar-greeting"></span>')
            .css({ 'font-size': '13px', 'color': '#555', 'line-height': '1' })
            .html('Bienvenido(a) <strong>' + $('<span>').text(name).html() + '</strong>' + ptsText);

        $slot.empty().append($el);
    }

    $(function () {
        if (!popoloBadge.email) return;

        var injected = false;
        var userPts  = null;

        function tryInject() {
            var $slot = $('.topbar-right-items');
            if (!$slot.length) return;
            if (document.getElementById('popolo-topbar-greeting') && injected) return;

            injectGreeting(userPts);
            injected = true;

            // Load points if not cached
            if (userPts === null) {
                try {
                    var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
                    if (cached && (Date.now() - cached.ts) < CACHE_TTL && cached.email === popoloBadge.email) {
                        userPts = cached.pts;
                        injectGreeting(userPts);
                        return;
                    }
                } catch (e) {}

                $.post(popoloBadge.ajaxurl, {
                    action:      'popolo_get_points',
                    _ajax_nonce: popoloBadge.nonce,
                    email:       popoloBadge.email,
                })
                .done(function (data) {
                    userPts = (data && data.found) ? (data.total_points || 0) : null;
                    injectGreeting(userPts);
                    try {
                        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                            pts: userPts, ts: Date.now(), email: popoloBadge.email
                        }));
                    } catch (e) {}
                });
            }
        }

        // Re-inject when the theme clears the slot
        var obs = new MutationObserver(function () {
            if (!document.getElementById('popolo-topbar-greeting')) {
                injected = false;
                tryInject();
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });

        tryInject();
        setTimeout(tryInject, 1000);
        setTimeout(tryInject, 2200);
    });

}(jQuery));
