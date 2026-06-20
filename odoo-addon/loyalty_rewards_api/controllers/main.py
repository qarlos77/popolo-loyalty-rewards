# -*- coding: utf-8 -*-
import json
import re
import requests as _req
from datetime import date as _date, datetime
from odoo import http, fields
from odoo.http import request, Response


def _json_response(data, status=200):
    return Response(
        json.dumps(data, default=str),
        status=status,
        mimetype='application/json',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
    )


def _auth_partner(req):
    auth = req.httprequest.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None, None
    token_str = auth[7:]
    token = req.env['loyalty.api.token'].sudo().validate(token_str)
    if not token:
        return None, None
    return token, token.partner_id


def _card_to_dict(card):
    return {
        'id': card.id,
        'code': card.code,
        'points': card.points,
        'points_display': f'{card.points:,.0f}',
        'program': {'id': card.program_id.id, 'name': card.program_id.name},
        'expiration_date': card.expiration_date,
    }


def _reward_to_dict(reward, card_points):
    return {
        'id': reward.id,
        'program_id': reward.program_id.id,
        'name': reward.description or reward.reward_type,
        'required_points': reward.required_points,
        'reward_type': reward.reward_type,
        'affordable': card_points >= reward.required_points,
        'discount': reward.discount if reward.reward_type == 'discount' else None,
    }


def _get_text(val):
    """Extrae texto legible de campos JSONB multiidioma de Odoo."""
    if not val:
        return ''
    if isinstance(val, dict):
        return val.get('es_PE') or val.get('en_US') or next(iter(val.values()), '')
    return str(val)


def _find_partner_by_email(env, email):
    email = (email or '').strip().lower()
    if not email:
        return None
    partner = env['res.partner'].sudo().search(
        [('email', '=ilike', email), ('active', '=', True)], limit=1
    )
    return partner if partner else None


def _birthday_info(partner, window_days=30, icp=None):
    """Return birthday status dict for a partner (uses Peru/Lima timezone for is_today)."""
    import pytz
    peru_tz    = pytz.timezone('America/Lima')
    today_peru = datetime.now(peru_tz).date()

    if not partner.loyalty_birth_date:
        return {
            'has_birth_date':           False,
            'is_today':                 False,
            'days_to_birthday':         None,
            'is_birthday_period':       False,
            'benefit_used_this_year':   False,
            'benefit_available':        False,
            'birthday_points_awarded':  0,
            'birthday_points_config':   0,
            'gift_product':             None,
        }

    birth = partner.loyalty_birth_date

    try:
        bday_this = birth.replace(year=today_peru.year)
    except ValueError:
        bday_this = birth.replace(year=today_peru.year, day=28)

    diff_from_bday = (today_peru - bday_this).days
    is_today = (diff_from_bday == 0)

    if diff_from_bday < 0:
        days_to   = -diff_from_bday
        in_window = False
    elif diff_from_bday == 0:
        days_to   = 0
        in_window = True
    else:
        try:
            bday_next = birth.replace(year=today_peru.year + 1)
        except ValueError:
            bday_next = birth.replace(year=today_peru.year + 1, day=28)
        days_to   = (bday_next - today_peru).days
        in_window = (diff_from_bday <= window_days)

    current_year = today_peru.year
    BdayLog = request.env['loyalty.birthday.redemption'].sudo()

    already_used = bool(BdayLog.search([
        ('partner_id', '=', partner.id),
        ('year', '=', current_year),
        ('source', '=', 'cashier'),
    ], limit=1))

    auto_log = BdayLog.search([
        ('partner_id', '=', partner.id),
        ('year', '=', current_year),
        ('source', '=', 'automatic'),
    ], limit=1)
    birthday_points_awarded = auto_log.points_awarded if auto_log else 0

    # Config: birthday points and gift product
    _icp = icp or request.env['ir.config_parameter'].sudo()
    birthday_points_config = int(float(_icp.get_param('loyalty_rewards_api.birthday_points', '0')))

    gift_product = None
    pid_str = _icp.get_param('loyalty_rewards_api.birthday_product_id', '')
    if pid_str and pid_str.isdigit():
        tmpl = request.env['product.template'].sudo().browse(int(pid_str))
        if tmpl.exists():
            gift_product = {
                'name':      tmpl.name,
                'image_url': f'/web/image/product.template/{tmpl.id}/image_512',
            }

    return {
        'has_birth_date':          True,
        'birth_date':              birth.isoformat(),
        'is_today':                is_today,
        'days_to_birthday':        days_to,
        'is_birthday_period':      in_window,
        'birthday_window_days':    window_days,
        'benefit_used_this_year':  already_used,
        'benefit_available':       in_window and not already_used,
        'birthday_points_awarded': birthday_points_awarded,
        'birthday_points_config':  birthday_points_config,
        'gift_product':            gift_product,
    }


class LoyaltyAPI(http.Controller):

    @http.route('/api/loyalty/<path:path>', type='http', auth='none', methods=['OPTIONS'], csrf=False)
    def cors_preflight(self, path, **kw):
        return _json_response({})

    # ── Auth ─────────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/auth', type='http', auth='none', methods=['POST'], csrf=False)
    def auth_login(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        identifier = (body.get('identifier') or '').strip().lower()
        if not identifier:
            return _json_response({'error': 'email required'}, 400)

        partner = _find_partner_by_email(request.env, identifier)
        if not partner:
            return _json_response({'error': 'Cliente no encontrado'}, 404)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        if not cards:
            return _json_response({'error': 'No se encontró cuenta de lealtad para este cliente'}, 404)

        token_rec = request.env['loyalty.api.token'].sudo().generate_for_partner(
            partner.id, device_hint=body.get('device_hint', '')
        )
        return _json_response({
            'token': token_rec.token,
            'expires_at': token_rec.expires_at.isoformat(),
            'partner': {
                'id': partner.id, 'name': partner.name,
                'email': partner.email or '', 'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
        })

    # ── Me ───────────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/me', type='http', auth='none', methods=['GET'], csrf=False)
    def me(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards  = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        icp    = request.env['ir.config_parameter'].sudo()
        window = int(float(icp.get_param('loyalty_rewards_api.birthday_window_days', '30')))

        return _json_response({
            'partner': {
                'id': partner.id, 'name': partner.name,
                'email': partner.email or '', 'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
            'total_points': sum(c.points for c in cards),
            'cards': [_card_to_dict(c) for c in cards],
            'birthday': _birthday_info(partner, window),
        })

    # ── Balance ──────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/balance', type='http', auth='none', methods=['GET'], csrf=False)
    def balance(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'total_points': sum(c.points for c in cards),
            'cards': [{'id': c.id, 'points': c.points, 'program_id': c.program_id.id} for c in cards],
            'timestamp': datetime.now().isoformat(),
        })

    # ── Rewards ──────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/rewards', type='http', auth='none', methods=['GET'], csrf=False)
    def rewards(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards    = request.env['loyalty.card'].sudo().search([
            ('partner_id', '=', partner.id),
            ('program_id.program_type', '=', 'loyalty'),
        ])
        card_pts = {c.program_id.id: c.points for c in cards}
        rewards  = request.env['loyalty.reward'].sudo().search([
            ('program_id', 'in', cards.mapped('program_id').ids),
            ('reward_type', 'in', ['free_product', 'discount', 'gift_card']),
        ], order='required_points asc')

        return _json_response({
            'total_points': sum(card_pts.values()),
            'rewards': [_reward_to_dict(r, card_pts.get(r.program_id.id, 0)) for r in rewards],
        })

    # ── History ──────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/history', type='http', auth='none', methods=['GET'], csrf=False)
    def history(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        limit      = int(request.httprequest.args.get('limit', 20))
        txns       = request.env['loyalty.transaction'].sudo().search(
            [('partner_id', '=', partner.id)], limit=limit, order='date desc'
        )
        cards      = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        lh_records = request.env['loyalty.history'].sudo().search(
            [('card_id', 'in', cards.ids)], limit=limit, order='id desc'
        )

        history = []
        for txn in txns:
            history.append({
                'id': f'txn_{txn.id}', 'type': 'redeemed',
                'description': f'Canje: {txn.reward_id.description or txn.reward_id.reward_type}',
                'points': -txn.points_used,
                'date': txn.date.isoformat(), 'state': txn.state,
                'code': txn.confirmation_code,
            })
        for lh in lh_records:
            pts = lh.issued - lh.used
            history.append({
                'id': f'lh_{lh.id}', 'type': 'earned' if pts >= 0 else 'redeemed',
                'description': lh.description or ('Puntos ganados' if pts >= 0 else 'Puntos usados'),
                'points': pts, 'date': lh.create_date.isoformat(), 'state': 'confirmed',
            })

        history.sort(key=lambda x: x['date'], reverse=True)
        return _json_response({'history': history[:limit]})

    # ── Redeem ───────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/redeem', type='http', auth='none', methods=['POST'], csrf=False)
    def redeem(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        reward_id = body.get('reward_id')
        card_id   = body.get('card_id')
        if not reward_id or not card_id:
            return _json_response({'error': 'reward_id and card_id required'}, 400)

        card   = request.env['loyalty.card'].sudo().browse(card_id)
        reward = request.env['loyalty.reward'].sudo().browse(reward_id)

        if not card.exists() or card.partner_id.id != partner.id:
            return _json_response({'error': 'Card not found'}, 404)
        if not reward.exists():
            return _json_response({'error': 'Reward not found'}, 404)
        if card.points < reward.required_points:
            return _json_response({'error': 'Insufficient points'}, 400)

        recent = request.env['loyalty.transaction'].sudo().search([
            ('partner_id', '=', partner.id), ('reward_id', '=', reward_id),
            ('state', '=', 'pending'), ('lock_expires', '>', fields.Datetime.now()),
        ], limit=1)
        if recent:
            return _json_response({
                'error': 'A redemption for this reward is already pending',
                'pending_code': recent.confirmation_code,
                'expires_at': recent.lock_expires.isoformat(),
            }, 409)

        txn = request.env['loyalty.transaction'].sudo().create_redemption(card, reward)
        card.sudo().write({'points': card.points - reward.required_points})
        self._notify_whatsapp_redeemed(partner, reward, txn)
        self._notify_email_redeemed(partner, reward, txn)

        return _json_response({
            'success': True, 'transaction_id': txn.id,
            'confirmation_code': txn.confirmation_code,
            'points_remaining': card.points,
            'reward': {'name': reward.description or reward.reward_type, 'required_points': reward.required_points},
            'expires_at': txn.lock_expires.isoformat(),
            'qr_payload': json.dumps({'type': 'loyalty_redeem', 'code': txn.confirmation_code,
                                      'txn_id': txn.id, 'partner_id': partner.id}),
        })

    # ── Confirm redemption ───────────────────────────────────────────────────
    @http.route('/api/loyalty/confirm-redeem', type='http', auth='none', methods=['POST'], csrf=False)
    def confirm_redeem(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        code = (body.get('code') or '').upper()
        txn  = request.env['loyalty.transaction'].sudo().search([
            ('confirmation_code', '=', code), ('state', '=', 'pending'),
        ], limit=1)

        if not txn:
            return _json_response({'error': 'Invalid or expired code'}, 404)
        if txn.lock_expires < fields.Datetime.now():
            txn.write({'state': 'expired'})
            txn.card_id.sudo().write({'points': txn.card_id.points + txn.points_used})
            return _json_response({'error': 'Redemption code has expired'}, 410)

        txn.write({'state': 'confirmed', 'redeemed_at': fields.Datetime.now()})
        return _json_response({
            'success': True, 'partner_name': txn.partner_id.name,
            'reward_name': txn.reward_id.description or txn.reward_id.reward_type,
            'points_used': txn.points_used, 'confirmed_at': txn.redeemed_at.isoformat(),
        })

    # ── Lookup (cashier) ─────────────────────────────────────────────────────
    @http.route('/api/loyalty/lookup', type='http', auth='none', methods=['POST'], csrf=False)
    def lookup(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        identifier = (body.get('identifier') or '').strip()
        partner = request.env['res.partner'].sudo().search([
            '|', '|',
            ('email', '=ilike', identifier),
            ('vat',   '=', identifier),
            ('phone', '=', identifier),
        ], limit=1)

        if not partner:
            return _json_response({'error': 'Customer not found'}, 404)

        icp    = request.env['ir.config_parameter'].sudo()
        window = int(float(icp.get_param('loyalty_rewards_api.birthday_window_days', '30')))
        cards  = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])

        return _json_response({
            'partner': {
                'id': partner.id, 'name': partner.name,
                'email': partner.email, 'vat': partner.vat,
                'birth_date': partner.loyalty_birth_date.isoformat() if partner.loyalty_birth_date else None,
            },
            'cards': [_card_to_dict(c) for c in cards],
            'total_points': sum(c.points for c in cards),
            'birthday': _birthday_info(partner, window),
        })

    # ── Points by email (checkout widget) ────────────────────────────────────
    @http.route('/api/loyalty/points-by-email', type='http', auth='none',
                methods=['GET', 'POST'], csrf=False)
    def points_by_email(self, **kw):
        icp        = request.env['ir.config_parameter'].sudo()
        stored_key = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key   = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key or sent_key != stored_key:
            return _json_response({'error': 'Unauthorized'}, 401)

        email = (request.httprequest.args.get('email') or '').strip()
        if not email:
            try:
                email = json.loads(request.httprequest.data or '{}').get('email', '').strip()
            except Exception:
                pass
        if not email:
            return _json_response({'error': 'email required'}, 400)

        partner = _find_partner_by_email(request.env, email)
        if not partner:
            return _json_response({'found': False, 'has_card': False, 'email': email}, 200)

        cards  = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        window = int(float(icp.get_param('loyalty_rewards_api.birthday_window_days', '30')))

        return _json_response({
            'found':        True,
            'has_card':     bool(cards),
            'partner_name': partner.name,
            'email':        partner.email,
            'total_points': sum(c.points for c in cards),
            'cards':        [_card_to_dict(c) for c in cards],
            'birthday':     _birthday_info(partner, window),
        })

    # ── Birthday status ───────────────────────────────────────────────────────
    @http.route('/api/loyalty/birthday-status', type='http', auth='none',
                methods=['GET', 'POST'], csrf=False)
    def birthday_status(self, **kw):
        icp        = request.env['ir.config_parameter'].sudo()
        stored_key = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key   = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key or sent_key != stored_key:
            return _json_response({'error': 'Unauthorized'}, 401)

        email = (request.httprequest.args.get('email') or '').strip().lower()
        if not email:
            try:
                email = json.loads(request.httprequest.data or '{}').get('email', '').strip().lower()
            except Exception:
                pass
        if not email:
            return _json_response({'error': 'email required'}, 400)

        partner = _find_partner_by_email(request.env, email)
        if not partner:
            return _json_response({'error': 'Cliente no encontrado'}, 404)

        window   = int(float(icp.get_param('loyalty_rewards_api.birthday_window_days', '30')))
        pid_str  = icp.get_param('loyalty_rewards_api.birthday_product_id', '')
        product_name = None
        if pid_str and pid_str.isdigit():
            tmpl = request.env['product.template'].sudo().browse(int(pid_str))
            if tmpl.exists():
                product_name = tmpl.name

        return _json_response({
            'partner_id':   partner.id,
            'partner_name': partner.name,
            'email':        partner.email,
            'birthday':     _birthday_info(partner, window),
            'gift_product': product_name,
        })

    # ── Birthday redeem (in-store, cashier only) ──────────────────────────────
    @http.route('/api/loyalty/birthday-redeem', type='http', auth='none',
                methods=['POST'], csrf=False)
    def birthday_redeem(self, **kw):
        icp        = request.env['ir.config_parameter'].sudo()
        stored_key = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key   = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key:
            return _json_response({'error': 'API key not configured in Odoo'}, 503)
        if sent_key != stored_key:
            return _json_response({'error': 'Unauthorized'}, 401)

        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        email = (body.get('email') or '').strip().lower()
        if not email:
            return _json_response({'error': 'email required'}, 400)

        partner = _find_partner_by_email(request.env, email)
        if not partner:
            return _json_response({'error': 'Cliente no encontrado'}, 404)

        if not partner.loyalty_birth_date:
            return _json_response(
                {'error': 'El cliente no tiene fecha de nacimiento registrada. '
                          'Actualiza su perfil en Odoo.'}, 400
            )

        window = int(float(icp.get_param('loyalty_rewards_api.birthday_window_days', '30')))
        bday   = _birthday_info(partner, window)

        if not bday['is_birthday_period']:
            return _json_response({
                'error': (f'El beneficio no está disponible. '
                          f'El próximo cumpleaños es en {bday["days_to_birthday"]} día(s).'),
                'days_to_birthday': bday['days_to_birthday'],
                'birthday': bday,
            }, 400)

        if bday['benefit_used_this_year']:
            return _json_response({
                'error': f'El cliente ya canjeó su beneficio de cumpleaños {_date.today().year}.',
                'already_used': True,
                'birthday': bday,
            }, 409)

        pid_str      = icp.get_param('loyalty_rewards_api.birthday_product_id', '')
        product_name = 'Regalo de cumpleaños'
        product_var  = False
        if pid_str and pid_str.isdigit():
            tmpl = request.env['product.template'].sudo().browse(int(pid_str))
            if tmpl.exists():
                product_name = tmpl.name
                if tmpl.product_variant_ids:
                    product_var = tmpl.product_variant_ids[0].id

        redemption = request.env['loyalty.birthday.redemption'].sudo().create({
            'partner_id':   partner.id,
            'year':         _date.today().year,
            'redeemed_at':  fields.Datetime.now(),
            'product_id':   product_var,
            'product_name': product_name,
            'redeemed_by':  (body.get('cashier') or 'Sistema').strip(),
            'notes':        (body.get('notes') or '').strip(),
        })

        return _json_response({
            'success':       True,
            'partner_name':  partner.name,
            'partner_email': partner.email,
            'product_name':  product_name,
            'year':          _date.today().year,
            'redeemed_at':   redemption.redeemed_at.isoformat(),
            'redemption_id': redemption.id,
        })

    # ── WooCommerce sync-order ────────────────────────────────────────────────
    @http.route('/api/loyalty/sync-order', type='http', auth='none', methods=['POST'], csrf=False)
    def sync_order(self, **kw):
        icp        = request.env['ir.config_parameter'].sudo()
        stored_key = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key   = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key:
            return _json_response({'error': 'Sync API key not configured in Odoo settings'}, 503)
        if sent_key != stored_key:
            return _json_response({'error': 'Invalid API key'}, 401)

        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        order_id       = str(body.get('order_id', '')).strip()
        email_raw      = str(body.get('customer_email', '')).strip().lower()
        phone_raw      = str(body.get('phone', '')).strip()
        order_total    = float(body.get('order_total', 0))
        currency       = body.get('currency', 'PEN')
        source         = body.get('source', 'woocommerce')
        customer_name  = str(body.get('customer_name', '')).strip()
        grant_welcome  = bool(body.get('grant_welcome_points', False))
        birth_date_raw = str(body.get('birth_date', '')).strip()

        if not order_id or not email_raw:
            return _json_response({'error': 'order_id and customer_email are required'}, 400)

        SyncLog = request.env['loyalty.sync.log'].sudo()

        try:
            duplicate = SyncLog.search([
                ('external_order_id', '=', order_id),
                ('source', '=', source), ('state', '=', 'synced'),
            ], limit=1)
            if duplicate:
                SyncLog.create({
                    'external_order_id': order_id, 'source': source,
                    'email': email_raw, 'order_total': order_total, 'currency': currency,
                    'state': 'duplicate',
                    'message': f'Order already synced (log id {duplicate.id})',
                })
                return _json_response({
                    'error': 'Order already synced', 'duplicate': True,
                    'partner': duplicate.partner_id.name if duplicate.partner_id else None,
                    'points': duplicate.points_awarded,
                }, 409)

            partner = _find_partner_by_email(request.env, email_raw)
            partner_created = False

            if not partner:
                partner = request.env['res.partner'].sudo().create({
                    'name': customer_name or f'Cliente WC #{order_id}',
                    'email': email_raw, 'phone': phone_raw or False, 'customer_rank': 1,
                })
                partner_created = True

            if birth_date_raw and not partner.loyalty_birth_date:
                try:
                    _date.fromisoformat(birth_date_raw)
                    partner.sudo().write({'loyalty_birth_date': birth_date_raw})
                except ValueError:
                    pass

            cards        = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
            card_was_new = False
            if not cards:
                program = request.env['loyalty.program'].sudo().search([
                    ('program_type', '=', 'loyalty'), ('active', '=', True),
                ], limit=1)
                if not program:
                    SyncLog.create({
                        'external_order_id': order_id, 'source': source,
                        'email': email_raw, 'phone': phone_raw,
                        'partner_id': partner.id, 'order_total': order_total,
                        'currency': currency, 'state': 'no_card',
                        'message': 'No active loyalty program found in Odoo.',
                    })
                    return _json_response({'error': 'No active loyalty program configured'}, 503)
                cards = request.env['loyalty.card'].sudo().create({
                    'partner_id': partner.id, 'program_id': program.id, 'points': 0,
                })
                card_was_new = True

            card   = cards[0] if len(cards) > 1 else cards
            ratio  = float(icp.get_param('loyalty_rewards_api.points_ratio', '0.1'))
            points = int(order_total * ratio)

            if points <= 0 and not grant_welcome:
                SyncLog.create({
                    'external_order_id': order_id, 'source': source,
                    'email': email_raw, 'phone': phone_raw, 'partner_id': partner.id,
                    'order_total': order_total, 'currency': currency,
                    'points_awarded': 0, 'state': 'synced',
                    'message': f'Total {order_total} debajo del mínimo (ratio={ratio}).',
                })
                return _json_response({
                    'success': True, 'points_awarded': 0,
                    'total_points': card.points, 'partner_created': partner_created,
                    'note': f'Monto mínimo para ganar puntos: {int(1/ratio)} {currency}',
                })

            if points > 0:
                card.sudo().write({'points': card.points + points})
                try:
                    request.env['loyalty.history'].sudo().create({
                        'card_id': card.id, 'description': f'Compra por la web #{order_id}',
                        'issued': points, 'used': 0,
                    })
                except Exception:
                    pass

            welcome_awarded  = 0
            odoo_welcome_cfg = int(float(icp.get_param('loyalty_rewards_api.welcome_points', '0')))
            req_welcome_cfg  = int(float(body.get('welcome_points', 0)))
            welcome_cfg      = odoo_welcome_cfg if odoo_welcome_cfg > 0 else req_welcome_cfg
            if grant_welcome and welcome_cfg > 0 and (partner_created or card_was_new):
                card.sudo().write({'points': card.points + welcome_cfg})
                welcome_awarded = welcome_cfg
                try:
                    request.env['loyalty.history'].sudo().create({
                        'card_id': card.id, 'description': 'Bienvenida al programa de lealtad',
                        'issued': welcome_cfg, 'used': 0,
                    })
                except Exception:
                    pass

            total_awarded = points + welcome_awarded
            SyncLog.create({
                'external_order_id': order_id, 'source': source,
                'email': email_raw, 'phone': phone_raw, 'partner_id': partner.id,
                'order_total': order_total, 'currency': currency,
                'points_awarded': total_awarded, 'state': 'synced',
                'message': (f'OK — {points} pts compra'
                            + (f' +{welcome_awarded} bienvenida' if welcome_awarded else '')
                            + f'. Saldo: {card.points}'
                            + (' (contacto creado)' if partner_created else '')),
            })
            self._notify_whatsapp_earned(partner, total_awarded, card.points)

            return _json_response({
                'success': True, 'partner_name': partner.name,
                'partner_email': partner.email, 'partner_created': partner_created,
                'points_awarded': points, 'welcome_points_awarded': welcome_awarded,
                'total_points': card.points, 'card_code': card.code,
            })

        except Exception as exc:
            request.env.cr.rollback()
            return _json_response({'error': f'Internal error: {exc}'}, 500)

    # ── Loyalty registration ──────────────────────────────────────────────────
    @http.route('/api/loyalty/register', type='http', auth='none', methods=['POST'], csrf=False)
    def register_loyalty(self, **kw):
        icp        = request.env['ir.config_parameter'].sudo()
        stored_key = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key   = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key:
            return _json_response({'error': 'API key not configured in Odoo'}, 503)
        if sent_key != stored_key:
            return _json_response({'error': 'Invalid API key'}, 401)

        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        name           = str(body.get('name', '')).strip()
        last_name      = str(body.get('last_name', '')).strip()
        email          = str(body.get('email', '')).strip().lower()
        phone          = str(body.get('phone', '')).strip()
        birth_date_raw = str(body.get('birth_date', '')).strip()

        if not name or not email:
            return _json_response({'error': 'name and email are required'}, 400)

        birth_date_val = False
        if birth_date_raw:
            try:
                _date.fromisoformat(birth_date_raw)
                birth_date_val = birth_date_raw
            except ValueError:
                return _json_response({'error': 'birth_date must be YYYY-MM-DD'}, 400)

        try:
            SyncLog = request.env['loyalty.sync.log'].sudo()
            partner = _find_partner_by_email(request.env, email)

            if partner:
                cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
                if cards:
                    SyncLog.create({
                        'external_order_id': f'REG-{email}', 'source': 'registration',
                        'email': email, 'phone': phone, 'partner_id': partner.id,
                        'state': 'duplicate', 'message': 'Ya registrado en el programa de lealtad.',
                    })
                    return _json_response({'already_registered': True, 'partner_name': partner.name}, 409)

            full_name = f'{name} {last_name}'.strip()
            if not partner:
                vals = {'name': full_name, 'email': email, 'phone': phone or False, 'customer_rank': 1}
                if birth_date_val:
                    vals['loyalty_birth_date'] = birth_date_val
                partner = request.env['res.partner'].sudo().create(vals)
            elif birth_date_val and not partner.loyalty_birth_date:
                partner.sudo().write({'loyalty_birth_date': birth_date_val})

            program = request.env['loyalty.program'].sudo().search([
                ('program_type', '=', 'loyalty'), ('active', '=', True),
            ], limit=1)
            if not program:
                return _json_response({'error': 'No active loyalty program configured'}, 503)

            card = request.env['loyalty.card'].sudo().create({
                'partner_id': partner.id, 'program_id': program.id, 'points': 0,
            })

            odoo_welcome = int(float(icp.get_param('loyalty_rewards_api.welcome_points', '0')))
            req_welcome  = int(float(body.get('welcome_points', 0)))
            welcome_pts  = odoo_welcome if odoo_welcome > 0 else req_welcome
            if welcome_pts > 0:
                card.sudo().write({'points': welcome_pts})
                try:
                    request.env['loyalty.history'].sudo().create({
                        'card_id': card.id, 'description': 'Bienvenida al programa de lealtad',
                        'issued': welcome_pts, 'used': 0,
                    })
                except Exception:
                    pass

            SyncLog.create({
                'external_order_id': f'REG-{email}', 'source': 'registration',
                'email': email, 'phone': phone, 'partner_id': partner.id,
                'points_awarded': welcome_pts, 'state': 'synced',
                'message': f'Registro exitoso — {welcome_pts} pts de bienvenida.',
            })
            self._notify_whatsapp_earned(partner, welcome_pts, card.points)

            return _json_response({
                'success': True, 'partner_name': partner.name,
                'partner_email': partner.email, 'welcome_points': welcome_pts,
                'total_points': card.points, 'card_code': card.code,
            })

        except Exception as exc:
            request.env.cr.rollback()
            return _json_response({'error': f'Internal error: {exc}'}, 500)

    # ── Coupons ──────────────────────────────────────────────────────────────
    @http.route('/api/loyalty/coupons', type='http', auth='none', methods=['GET'], csrf=False)
    def coupons(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([
            ('partner_id', '=', partner.id),
            ('program_id.program_type', '=', 'promo_code'),
            ('program_id.active', '=', True),
        ])

        result = []
        for card in cards:
            rewards = request.env['loyalty.reward'].sudo().search(
                [('program_id', '=', card.program_id.id)], limit=1
            )
            reward = rewards[0] if rewards else None
            result.append({
                'id':              card.id,
                'code':            card.code,
                'program_name':    _get_text(card.program_id.name),
                'points':          card.points,
                'available':       bool(card.points >= 1 and card.active),
                'expiration_date': card.expiration_date,
                'reward': {
                    'type':         reward.reward_type,
                    'discount':     reward.discount,
                    'discount_mode': reward.discount_mode,
                    'description':  _get_text(reward.description),
                } if reward else None,
            })

        return _json_response({'coupons': result})

    # ── Self-registration (público, sin API key) ──────────────────────────────
    @http.route('/api/loyalty/self-register', type='http', auth='none', methods=['POST'], csrf=False)
    def self_register(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        name           = str(body.get('name', '')).strip()
        last_name      = str(body.get('last_name', '')).strip()
        email          = str(body.get('email', '')).strip().lower()
        phone          = str(body.get('phone', '')).strip()
        birth_date_raw = str(body.get('birth_date', '')).strip()

        if not name or not email:
            return _json_response({'error': 'El nombre y el correo son obligatorios'}, 400)

        if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            return _json_response({'error': 'Correo electrónico inválido'}, 400)

        birth_date_val = False
        if birth_date_raw:
            try:
                _date.fromisoformat(birth_date_raw)
                birth_date_val = birth_date_raw
            except ValueError:
                return _json_response({'error': 'Fecha de nacimiento inválida (usa YYYY-MM-DD)'}, 400)

        try:
            partner = _find_partner_by_email(request.env, email)

            if partner:
                cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
                if cards:
                    return _json_response({
                        'error': 'Este correo ya está registrado en el programa de lealtad. Inicia sesión con tu correo.',
                        'already_registered': True,
                    }, 409)

            full_name = f'{name} {last_name}'.strip()
            if not partner:
                vals = {'name': full_name, 'email': email, 'phone': phone or False, 'customer_rank': 1}
                if birth_date_val:
                    vals['loyalty_birth_date'] = birth_date_val
                partner = request.env['res.partner'].sudo().create(vals)
            else:
                update = {}
                if birth_date_val and not partner.loyalty_birth_date:
                    update['loyalty_birth_date'] = birth_date_val
                if full_name:
                    update['name'] = full_name
                if update:
                    partner.sudo().write(update)

            icp = request.env['ir.config_parameter'].sudo()
            self._create_wc_customer(
                icp        = icp,
                email      = email,
                first_name = name,
                last_name  = last_name,
                phone      = phone,
            )

            program = request.env['loyalty.program'].sudo().search([
                ('program_type', '=', 'loyalty'), ('active', '=', True),
            ], limit=1)
            if not program:
                return _json_response({'error': 'No hay un programa de lealtad activo configurado'}, 503)

            card = request.env['loyalty.card'].sudo().create({
                'partner_id': partner.id, 'program_id': program.id, 'points': 0,
            })

            icp = request.env['ir.config_parameter'].sudo()
            welcome_pts = int(float(icp.get_param('loyalty_rewards_api.welcome_points', '0')))
            if welcome_pts > 0:
                card.sudo().write({'points': welcome_pts})
                try:
                    request.env['loyalty.history'].sudo().create({
                        'card_id': card.id, 'description': 'Bienvenida al programa de lealtad',
                        'issued': welcome_pts, 'used': 0,
                    })
                except Exception:
                    pass

            # Asignar cupón de bienvenida (primer pedido / promo_code)
            coupon_card = None
            coupon_info = None
            promo_program = request.env['loyalty.program'].sudo().search([
                ('program_type', '=', 'promo_code'),
                ('active', '=', True),
            ], limit=1)
            if promo_program:
                already_has = request.env['loyalty.card'].sudo().search([
                    ('partner_id', '=', partner.id),
                    ('program_id', '=', promo_program.id),
                ], limit=1)
                if not already_has:
                    coupon_card = request.env['loyalty.card'].sudo().create({
                        'partner_id': partner.id,
                        'program_id': promo_program.id,
                        'points':     1,
                    })
                    reward = request.env['loyalty.reward'].sudo().search(
                        [('program_id', '=', promo_program.id)], limit=1
                    )
                    coupon_info = {
                        'code':         coupon_card.code,
                        'program_name': _get_text(promo_program.name),
                        'description':  _get_text(reward.description) if reward else '',
                    }
                    # Replicar cupón en WooCommerce
                    self._create_wc_coupon(
                        icp        = icp,
                        code       = coupon_card.code,
                        discount   = reward.discount if reward else 0,
                        email      = email,
                        desc       = _get_text(promo_program.name),
                    )

            token_rec = request.env['loyalty.api.token'].sudo().generate_for_partner(
                partner.id, device_hint='self-registration'
            )

            try:
                request.env['loyalty.sync.log'].sudo().create({
                    'external_order_id': f'SELFREG-{email}', 'source': 'self_registration',
                    'email': email, 'phone': phone, 'partner_id': partner.id,
                    'points_awarded': welcome_pts, 'state': 'synced',
                    'message': (f'Registro propio — {welcome_pts} pts de bienvenida'
                                + (f' + cupón {coupon_info["code"]}' if coupon_info else '') + '.'),
                })
            except Exception:
                pass

            self._notify_whatsapp_earned(partner, welcome_pts, card.points)

            return _json_response({
                'success':        True,
                'token':          token_rec.token,
                'expires_at':     token_rec.expires_at.isoformat(),
                'partner': {
                    'id':        partner.id,
                    'name':      partner.name,
                    'email':     partner.email or '',
                    'phone':     partner.phone or '',
                    'vat':       partner.vat,
                    'image_url': f'/web/image/res.partner/{partner.id}/image_128',
                },
                'welcome_points': welcome_pts,
                'total_points':   card.points,
                'coupon':         coupon_info,
            })

        except Exception as exc:
            request.env.cr.rollback()
            return _json_response({'error': f'Error interno: {exc}'}, 500)

    # ── WooCommerce helpers ───────────────────────────────────────────────────
    def _create_wc_customer(self, icp, email, first_name, last_name='', phone=''):
        wc_url    = (icp.get_param('loyalty_rewards_api.wc_url') or '').rstrip('/')
        wc_key    = icp.get_param('loyalty_rewards_api.wc_consumer_key')
        wc_secret = icp.get_param('loyalty_rewards_api.wc_consumer_secret')
        if not (wc_url and wc_key and wc_secret):
            return
        try:
            resp = _req.post(
                f'{wc_url}/wp-json/wc/v3/customers',
                auth=(wc_key, wc_secret),
                json={
                    'email':      email,
                    'first_name': first_name,
                    'last_name':  last_name,
                    'billing': {
                        'first_name': first_name,
                        'last_name':  last_name,
                        'email':      email,
                        'phone':      phone or '',
                    },
                },
                timeout=8,
            )
            if resp.status_code not in (200, 201):
                err = {}
                try:
                    err = resp.json()
                except Exception:
                    pass
                if err.get('code') == 'registration-error-email-exists':
                    return  # already exists, not an error
                try:
                    request.env['loyalty.sync.log'].sudo().create({
                        'external_order_id': f'WC-CUSTOMER-{email}',
                        'source': 'wc_customer',
                        'email': email,
                        'state': 'error',
                        'message': f'WC customer creation failed HTTP {resp.status_code}: {resp.text[:300]}',
                    })
                except Exception:
                    pass
        except Exception as exc:
            try:
                request.env['loyalty.sync.log'].sudo().create({
                    'external_order_id': f'WC-CUSTOMER-{email}',
                    'source': 'wc_customer',
                    'email': email,
                    'state': 'error',
                    'message': f'WC customer creation exception: {type(exc).__name__}: {exc}',
                })
            except Exception:
                pass

    def _create_wc_coupon(self, icp, code, discount, email, desc=''):
        wc_url    = (icp.get_param('loyalty_rewards_api.wc_url') or '').rstrip('/')
        wc_key    = icp.get_param('loyalty_rewards_api.wc_consumer_key')
        wc_secret = icp.get_param('loyalty_rewards_api.wc_consumer_secret')
        if not (wc_url and wc_key and wc_secret):
            return
        try:
            resp = _req.post(
                f'{wc_url}/wp-json/wc/v3/coupons',
                auth=(wc_key, wc_secret),
                json={
                    'code':                 code,
                    'discount_type':        'percent',
                    'amount':               str(int(discount or 0)),
                    'usage_limit':          1,
                    'usage_limit_per_user': 1,
                    'email_restrictions':   [email],
                    'description':          f'PopoloPizza Rewards — {desc}',
                },
                timeout=8,
            )
            if resp.status_code not in (200, 201):
                try:
                    request.env['loyalty.sync.log'].sudo().create({
                        'external_order_id': f'WC-COUPON-{code}',
                        'source': 'wc_coupon',
                        'email': email,
                        'state': 'error',
                        'message': f'WC coupon creation failed HTTP {resp.status_code}: {resp.text[:300]}',
                    })
                except Exception:
                    pass
        except Exception as exc:
            try:
                request.env['loyalty.sync.log'].sudo().create({
                    'external_order_id': f'WC-COUPON-{code}',
                    'source': 'wc_coupon',
                    'email': email,
                    'state': 'error',
                    'message': f'WC coupon creation exception: {type(exc).__name__}: {exc}',
                })
            except Exception:
                pass

    # ── WhatsApp helpers ──────────────────────────────────────────────────────
    def _notify_whatsapp_earned(self, partner, points_earned, total_points):
        icp      = request.env['ir.config_parameter'].sudo()
        phone_id = icp.get_param('loyalty_rewards_api.wa_phone_id')
        token    = icp.get_param('loyalty_rewards_api.wa_token')
        template = icp.get_param('loyalty_rewards_api.wa_template_earned', 'loyalty_earned')
        phone    = re.sub(r'\D', '', partner.phone or '')
        if not phone_id or not token or not phone:
            return
        try:
            _req.post(
                f'https://graph.facebook.com/v19.0/{phone_id}/messages',
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                json={
                    'messaging_product': 'whatsapp', 'to': phone, 'type': 'template',
                    'template': {
                        'name': template, 'language': {'code': 'es'},
                        'components': [{'type': 'body', 'parameters': [
                            {'type': 'text', 'text': partner.name},
                            {'type': 'text', 'text': str(int(points_earned))},
                            {'type': 'text', 'text': str(int(total_points))},
                        ]}],
                    },
                }, timeout=5,
            )
        except Exception:
            pass

    def _notify_whatsapp_redeemed(self, partner, reward, txn):
        icp      = request.env['ir.config_parameter'].sudo()
        phone_id = icp.get_param('loyalty_rewards_api.wa_phone_id')
        token    = icp.get_param('loyalty_rewards_api.wa_token')
        template = icp.get_param('loyalty_rewards_api.wa_template_redeemed', 'loyalty_redeemed')
        phone    = re.sub(r'\D', '', partner.phone or '')
        if not phone_id or not token or not phone:
            return
        try:
            _req.post(
                f'https://graph.facebook.com/v19.0/{phone_id}/messages',
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                json={
                    'messaging_product': 'whatsapp', 'to': phone, 'type': 'template',
                    'template': {
                        'name': template, 'language': {'code': 'es'},
                        'components': [{'type': 'body', 'parameters': [
                            {'type': 'text', 'text': partner.name},
                            {'type': 'text', 'text': reward.description or reward.reward_type},
                            {'type': 'text', 'text': txn.confirmation_code},
                        ]}],
                    },
                }, timeout=5,
            )
        except Exception:
            pass

    def _notify_email_redeemed(self, partner, reward, txn):
        if not partner.email:
            return
        try:
            template = request.env.ref(
                'loyalty_rewards_api.mail_template_reward_redeemed', raise_if_not_found=False
            )
            if template:
                template.with_context(
                    reward_name=reward.description or reward.reward_type,
                    confirmation_code=txn.confirmation_code,
                ).send_mail(txn.id, force_send=True, email_values={'email_to': partner.email})
        except Exception:
            pass
