(function ($) {
    'use strict';

    var CACHE_KEY   = 'popolo_pts_cache';
    var CACHE_TTL   = 5 * 60 * 1000;
    var LOCAL_KEY   = 'popolo_local';
    var COOKIE_DAYS = 30;

    var LOCALES = [
        { label: 'Miraflores', url: 'https://miraflores.popolopizza.com/' },
        { label: 'San Isidro', url: 'https://sanisidro.popolopizza.com/'  },
        { label: 'Chacarilla', url: 'https://chacarilla.popolopizza.com/' },
    ];

    function fmt(n) {
        return Number(n).toLocaleString('es-PE');
    }

    function setCookie(name, value, days) {
        var expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value)
            + '; expires=' + expires
            + '; path=/'
            + '; domain=.popolopizza.com'
            + '; SameSite=Lax';
    }

    function getCookie(name) {
        var match = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
        return match ? decodeURIComponent(match[1]) : null;
    }

    function saveLocal(url) {
        localStorage.setItem(LOCAL_KEY, url);
        setCookie(LOCAL_KEY, url, COOKIE_DAYS);
    }

    function currentLocal() {
        var host = window.location.hostname;
        for (var i = 0; i < LOCALES.length; i++) {
            var locHost = LOCALES[i].url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (host === locHost) return LOCALES[i];
        }
        var saved = getCookie(LOCAL_KEY) || localStorage.getItem(LOCAL_KEY);
        for (var j = 0; j < LOCALES.length; j++) {
            if (LOCALES[j].url === saved) return LOCALES[j];
        }
        return null;
    }

    function buildLocalDropdown() {
        var active = currentLocal();

        var $wrap = $('<div id="popolo-local-wrap"></div>').css({
            'position':    'relative',
            'display':     'inline-flex',
            'align-items': 'center',
            'gap':         '6px',
            'font-size':   '12px',
            'color':       '#555',
            'cursor':      'pointer',
            'user-select': 'none',
        });

        var $trigger = $('<span id="popolo-local-trigger"></span>').css({
            'display':     'inline-flex',
            'align-items': 'center',
            'gap':         '4px',
        }).html('📍 Seleccione un local para tu pedido: <strong id="popolo-local-label">'
            + (active ? active.label : '— Elige —') + '</strong> ▾');

        var $menu = $('<div id="popolo-local-menu"></div>').css({
            'display':       'none',
            'position':      'absolute',
            'top':           '100%',
            'right':         '0',
            'background':    '#fff',
            'border':        '1px solid #ddd',
            'border-radius': '4px',
            'box-shadow':    '0 4px 12px rgba(0,0,0,0.1)',
            'z-index':       '9999',
            'min-width':     '160px',
            'padding':       '4px 0',
        });

        $.each(LOCALES, function (i, loc) {
            var $item = $('<a></a>')
                .attr('href', loc.url)
                .text(loc.label)
                .css({
                    'display':         'block',
                    'padding':         '8px 16px',
                    'color':           '#333',
                    'font-size':       '13px',
                    'text-decoration': 'none',
                    'white-space':     'nowrap',
                });

            if (active && loc.url === active.url) {
                $item.css({ 'font-weight': 'bold', 'color': '#ff4a4a' });
            }

            $item.on('mouseenter', function () { $(this).css('background', '#f5f5f5'); });
            $item.on('mouseleave', function () { $(this).css('background', ''); });
            $item.on('click', function () { saveLocal(loc.url); });

            $menu.append($item);
        });

        $trigger.on('click', function (e) {
            e.stopPropagation();
            $menu.toggle();
        });

        $(document).on('click.popolo-local', function () { $menu.hide(); });

        $wrap.append($trigger).append($menu);
        return $wrap;
    }

    function injectGreeting(pts) {
        if (!popoloBadge.email) return;

        var $topbar = $('#topbar .razzi-container-fluid, #topbar .container').first();
        if (!$topbar.length) return;

        var $left = $('#topbar .topbar-left-items');
        if (!$left.length) {
            $left = $('<div class="topbar-items topbar-left-items"></div>');
            $topbar.prepend($left);
        }

        var name    = (popoloBadge.name || '').split(' ')[0];
        var ptsText = (pts !== null) ? ', tienes ' + fmt(pts) + ' pts acumulados' : '';
        var $greeting = $('#popolo-topbar-greeting');
        if (!$greeting.length) {
            $greeting = $('<span id="popolo-topbar-greeting"></span>').css({
                'font-size':   '13px',
                'color':       '#555',
                'line-height': '1',
            });
            $left.append($greeting);
        }
        $greeting.text('Bienvenido(a) ' + name + ptsText);
    }

    function injectLocalDropdown() {
        if (document.getElementById('popolo-local-wrap')) return;
        var $right = $('#topbar .topbar-right-items');
        if (!$right.length) return;
        $right.prepend(buildLocalDropdown());
    }

    $(function () {
        var injected = false;
        var userPts  = null;

        function tryInject() {
            var $topbar = $('#topbar .razzi-container-fluid, #topbar .container').first();
            if (!$topbar.length) return;
            if (document.getElementById('popolo-local-wrap') && injected) return;

            injectLocalDropdown();
            injectGreeting(userPts);
            injected = true;

            if (!popoloBadge.email) return;

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

        var obs = new MutationObserver(function () {
            if (!document.getElementById('popolo-local-wrap')) {
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
