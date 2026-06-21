(function ($) {
    'use strict';

    var CACHE_KEY = 'popolo_pts_cache';
    var CACHE_TTL = 5 * 60 * 1000; // 5 min

    function fmt(n) {
        return Number(n).toLocaleString('es-PE');
    }

    function showBadge(pts) {
        $('#popolo-badge-pts').text(fmt(pts));
        $('#popolo-points-badge').fadeIn(400);
    }

    function loadBadge() {
        var $badge = $('#popolo-points-badge');
        if (!$badge.length || !popoloBadge.email) return;

        // Serve from sessionStorage cache to avoid hitting Odoo on every page
        try {
            var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (cached && (Date.now() - cached.ts) < CACHE_TTL && cached.email === popoloBadge.email) {
                if (cached.pts !== null) showBadge(cached.pts);
                return;
            }
        } catch (e) {}

        $.post(popoloBadge.ajaxurl, {
            action:      'popolo_get_points',
            _ajax_nonce: popoloBadge.nonce,
            email:       popoloBadge.email,
        })
        .done(function (data) {
            if (data && data.found && data.has_card) {
                var pts = data.total_points || 0;
                showBadge(pts);
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                        pts:   pts,
                        ts:    Date.now(),
                        email: popoloBadge.email,
                    }));
                } catch (e) {}
            }
        });
    }

    $(function () { loadBadge(); });

}(jQuery));
