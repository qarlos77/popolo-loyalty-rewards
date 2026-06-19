# -*- coding: utf-8 -*-
import json
import re
import requests as _req
from datetime import datetime
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
    """Validate Bearer token → (token_record, partner) or (None, None)."""
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
        'program': {
            'id': card.program_id.id,
            'name': card.program_id.name,
        },
        'expiration_date': card.expiration_date,
    }


def _reward_to_dict(reward, card_points):
    affordable = card_points >= reward.required_points
    return {
        'id': reward.id,
        'program_id': reward.program_id.id,
        'name': reward.description or reward.reward_type,
        'required_points': reward.required_points,
        'reward_type': reward.reward_type,
        'affordable': affordable,
        'discount': reward.discount if reward.reward_type == 'discount' else None,
    }


def _normalize_phone(raw):
    """Strip formatting; remove leading country code (51 = Peru)."""
    digits = re.sub(r'\D', '', raw or '')
    # Remove Peruvian country code: +51 or 0051
    if len(digits) >= 11 and digits.startswith('51'):
        digits = digits[2:]
    elif len(digits) >= 12 and digits.startswith('0051'):
        digits = digits[4:]
    return digits


class LoyaltyAPI(http.Controller):

    # ── CORS preflight ───────────────────────────────────────────────────────
    @http.route('/api/loyalty/<path:path>', type='http', auth='none',
                methods=['OPTIONS'], csrf=False)
    def cors_preflight(self, path, **kw):
        return _json_response({})

    # ── Auth: login ──────────────────────────────────────────────────────────
    @http.route('/api/loyalty/auth', type='http', auth='none',
                methods=['POST'], csrf=False)
    def auth_login(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        identifier = (body.get('identifier') or '').strip()
        if not identifier:
            return _json_response({'error': 'phone required'}, 400)

        env = request.env['res.partner'].sudo()
        partner = env.search([('phone', '=', identifier), ('active', '=', True)], limit=1)

        if not partner:
            return _json_response({'error': 'Customer not found'}, 404)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        if not cards:
            return _json_response({'error': 'No loyalty account found for this customer'}, 404)

        device_hint = body.get('device_hint', '')
        token_rec = request.env['loyalty.api.token'].sudo().generate_for_partner(
            partner.id, device_hint=device_hint
        )

        return _json_response({
            'token': token_rec.token,
            'expires_at': token_rec.expires_at.isoformat(),
            'partner': {
                'id': partner.id,
                'name': partner.name,
                'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
        })

    # ── Profile + all cards ──────────────────────────────────────────────────
    @http.route('/api/loyalty/me', type='http', auth='none',
                methods=['GET'], csrf=False)
    def me(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        total_points = sum(c.points for c in cards)

        return _json_response({
            'partner': {
                'id': partner.id,
                'name': partner.name,
                'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
            'total_points': total_points,
            'cards': [_card_to_dict(c) for c in cards],
        })

    # ── Real-time balance ────────────────────────────────────────────────────
    @http.route('/api/loyalty/balance', type='http', auth='none',
                methods=['GET'], csrf=False)
    def balance(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'total_points': sum(c.points for c in cards),
            'cards': [{'id': c.id, 'points': c.points, 'program_id': c.program_id.id}
                      for c in cards],
            'timestamp': datetime.now().isoformat(),
        })

    # ── Rewards catalog ──────────────────────────────────────────────────────
    @http.route('/api/loyalty/rewards', type='http', auth='none',
                methods=['GET'], csrf=False)
    def rewards(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        card_points_by_program = {c.program_id.id: c.points for c in cards}
        total_points = sum(card_points_by_program.values())

        program_ids = cards.mapped('program_id').ids
        rewards = request.env['loyalty.reward'].sudo().search([
            ('program_id', 'in', program_ids),
            ('reward_type', 'in', ['free_product', 'discount', 'gift_card']),
        ], order='required_points asc')

        return _json_response({
            'total_points': total_points,
            'rewards': [_reward_to_dict(r, card_points_by_program.get(r.program_id.id, 0))
                        for r in rewards],
        })

    # ── Transaction history ──────────────────────────────────────────────────
    @http.route('/api/loyalty/history', type='http', auth='none',
                methods=['GET'], csrf=False)
    def history(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        limit = int(request.httprequest.args.get('limit', 20))

        txns = request.env['loyalty.transaction'].sudo().search([
            ('partner_id', '=', partner.id),
        ], limit=limit, order='date desc')

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        lh_records = request.env['loyalty.history'].sudo().search([
            ('card_id', 'in', cards.ids),
        ], limit=limit, order='id desc')

        history = []

        for txn in txns:
            history.append({
                'id': f'txn_{txn.id}',
                'type': 'redeemed',
                'description': f'Canje: {txn.reward_id.description or txn.reward_id.reward_type}',
                'points': -txn.points_used,
                'date': txn.date.isoformat(),
                'state': txn.state,
                'code': txn.confirmation_code,
            })

        for lh in lh_records:
            pts = lh.issued - lh.used
            history.append({
                'id': f'lh_{lh.id}',
                'type': 'earned' if pts >= 0 else 'redeemed',
                'description': lh.description or ('Puntos ganados' if pts >= 0 else 'Puntos usados'),
                'points': pts,
                'date': lh.create_date.isoformat(),
                'state': 'confirmed',
            })

        history.sort(key=lambda x: x['date'], reverse=True)
        return _json_response({'history': history[:limit]})

    # ── Redeem reward ────────────────────────────────────────────────────────
    @http.route('/api/loyalty/redeem', type='http', auth='none',
                methods=['POST'], csrf=False)
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

        env    = request.env
        card   = env['loyalty.card'].sudo().browse(card_id)
        reward = env['loyalty.reward'].sudo().browse(reward_id)

        if not card.exists() or card.partner_id.id != partner.id:
            return _json_response({'error': 'Card not found'}, 404)
        if not reward.exists():
            return _json_response({'error': 'Reward not found'}, 404)
        if card.points < reward.required_points:
            return _json_response({'error': 'Insufficient points'}, 400)

        recent = env['loyalty.transaction'].sudo().search([
            ('partner_id', '=', partner.id),
            ('reward_id',  '=', reward_id),
            ('state',      '=', 'pending'),
            ('lock_expires', '>', fields.Datetime.now()),
        ], limit=1)
        if recent:
            return _json_response({
                'error': 'A redemption for this reward is already pending',
                'pending_code': recent.confirmation_code,
                'expires_at': recent.lock_expires.isoformat(),
            }, 409)

        txn = env['loyalty.transaction'].sudo().create_redemption(card, reward)
        card.sudo().write({'points': card.points - reward.required_points})

        self._notify_whatsapp_redeemed(partner, reward, txn)
        self._notify_email_redeemed(partner, reward, txn)

        return _json_response({
            'success': True,
            'transaction_id': txn.id,
            'confirmation_code': txn.confirmation_code,
            'points_remaining': card.points,
            'reward': {
                'name': reward.description or reward.reward_type,
                'required_points': reward.required_points,
            },
            'expires_at': txn.lock_expires.isoformat(),
            'qr_payload': json.dumps({
                'type': 'loyalty_redeem',
                'code': txn.confirmation_code,
                'txn_id': txn.id,
                'partner_id': partner.id,
            }),
        })

    # ── Confirm redemption (cashier scan) ────────────────────────────────────
    @http.route('/api/loyalty/confirm-redeem', type='http', auth='none',
                methods=['POST'], csrf=False)
    def confirm_redeem(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        code = (body.get('code') or '').upper()
        txn  = request.env['loyalty.transaction'].sudo().search([
            ('confirmation_code', '=', code),
            ('state', '=', 'pending'),
        ], limit=1)

        if not txn:
            return _json_response({'error': 'Invalid or expired code'}, 404)

        if txn.lock_expires < fields.Datetime.now():
            txn.write({'state': 'expired'})
            txn.card_id.sudo().write({'points': txn.card_id.points + txn.points_used})
            return _json_response({'error': 'Redemption code has expired'}, 410)

        txn.write({'state': 'confirmed', 'redeemed_at': fields.Datetime.now()})
        return _json_response({
            'success': True,
            'partner_name': txn.partner_id.name,
            'reward_name': txn.reward_id.description or txn.reward_id.reward_type,
            'points_used': txn.points_used,
            'confirmed_at': txn.redeemed_at.isoformat(),
        })

    # ── Lookup by phone/DNI (cashier) ────────────────────────────────────────
    @http.route('/api/loyalty/lookup', type='http', auth='none',
                methods=['POST'], csrf=False)
    def lookup_by_dni(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        identifier = (body.get('identifier') or '').strip()
        env = request.env
        partner = env['res.partner'].sudo().search([
            '|', ('vat', '=', identifier), ('phone', '=', identifier)
        ], limit=1)

        if not partner:
            return _json_response({'error': 'Customer not found'}, 404)

        cards = env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'partner': {'id': partner.id, 'name': partner.name, 'vat': partner.vat},
            'cards': [_card_to_dict(c) for c in cards],
            'total_points': sum(c.points for c in cards),
        })

    # ── WooCommerce sync-order ───────────────────────────────────────────────
    @http.route('/api/loyalty/sync-order', type='http', auth='none',
                methods=['POST'], csrf=False)
    def sync_order(self, **kw):
        # --- API key auth ---
        icp         = request.env['ir.config_parameter'].sudo()
        stored_key  = icp.get_param('loyalty_rewards_api.sync_api_key', '')
        sent_key    = request.httprequest.headers.get('X-API-Key', '')
        if not stored_key:
            return _json_response({'error': 'Sync API key not configured in Odoo settings'}, 503)
        if sent_key != stored_key:
            return _json_response({'error': 'Invalid API key'}, 401)

        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        order_id    = str(body.get('order_id', '')).strip()
        phone_raw   = str(body.get('phone', '')).strip()
        order_total = float(body.get('order_total', 0))
        currency    = body.get('currency', 'PEN')
        source      = body.get('source', 'woocommerce')
        order_key   = body.get('order_key', '')

        if not order_id or not phone_raw:
            return _json_response({'error': 'order_id and phone are required'}, 400)

        SyncLog = request.env['loyalty.sync.log'].sudo()

        # --- Idempotency: already synced? ---
        duplicate = SyncLog.search([
            ('external_order_id', '=', order_id),
            ('source',            '=', source),
            ('state',             '=', 'synced'),
        ], limit=1)
        if duplicate:
            SyncLog.create({
                'external_order_id': order_id,
                'source':  source,
                'phone':   phone_raw,
                'order_total': order_total,
                'currency':    currency,
                'state':   'duplicate',
                'message': f'Order already synced (log id {duplicate.id})',
            })
            return _json_response({
                'error':     'Order already synced',
                'duplicate': True,
                'partner':   duplicate.partner_id.name if duplicate.partner_id else None,
                'points':    duplicate.points_awarded,
            }, 409)

        # --- Normalize and search phone ---
        phone_clean = _normalize_phone(phone_raw)
        Partner = request.env['res.partner'].sudo()
        partner = (
            Partner.search([('phone', '=', phone_clean),  ('active', '=', True)], limit=1)
            or Partner.search([('phone', '=', phone_raw), ('active', '=', True)], limit=1)
            or Partner.search([('phone', 'like', phone_clean[-9:]), ('active', '=', True)], limit=1)
            if len(phone_clean) >= 9 else Partner
        )

        if not partner or not partner.id:
            SyncLog.create({
                'external_order_id': order_id,
                'source':  source,
                'phone':   phone_raw,
                'order_total': order_total,
                'currency':    currency,
                'state':   'no_partner',
                'message': f'No partner found for phone "{phone_raw}" (cleaned: "{phone_clean}")',
            })
            return _json_response({
                'error': 'Partner not found',
                'phone': phone_raw,
                'hint':  'Register this phone number in Odoo Contacts first.',
            }, 404)

        # --- Find or create loyalty card ---
        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        if not cards:
            program = request.env['loyalty.program'].sudo().search([
                ('program_type', '=', 'loyalty'),
                ('active',       '=', True),
            ], limit=1)
            if not program:
                SyncLog.create({
                    'external_order_id': order_id,
                    'source':  source,
                    'phone':   phone_raw,
                    'partner_id': partner.id,
                    'order_total': order_total,
                    'currency':    currency,
                    'state':   'no_card',
                    'message': 'No active loyalty program found in Odoo.',
                })
                return _json_response({'error': 'No active loyalty program configured'}, 503)
            cards = request.env['loyalty.card'].sudo().create({
                'partner_id': partner.id,
                'program_id': program.id,
                'points':     0,
            })

        card = cards[0] if len(cards) > 1 else cards

        # --- Calculate points ---
        ratio  = float(icp.get_param('loyalty_rewards_api.points_ratio', '0.1'))
        points = int(order_total * ratio)

        if points <= 0:
            SyncLog.create({
                'external_order_id': order_id,
                'source':  source,
                'phone':   phone_raw,
                'partner_id': partner.id,
                'order_total': order_total,
                'currency':    currency,
                'points_awarded': 0,
                'state':   'synced',
                'message': f'Order total {order_total} is below minimum threshold (ratio={ratio}).',
            })
            return _json_response({
                'success':   True,
                'points_awarded': 0,
                'note':      f'Order total too small to earn points (need at least {int(1/ratio)} {currency})',
                'total_points': card.points,
            })

        # --- Award points ---
        card.sudo().write({'points': card.points + points})

        request.env['loyalty.history'].sudo().create({
            'card_id':     card.id,
            'description': f'WooCommerce #{order_id}',
            'issued':      points,
            'used':        0,
        })

        SyncLog.create({
            'external_order_id': order_id,
            'source':  source,
            'phone':   phone_raw,
            'partner_id':   partner.id,
            'order_total':  order_total,
            'currency':     currency,
            'points_awarded': points,
            'state':   'synced',
            'message': f'OK — {points} pts awarded. New balance: {card.points}',
        })

        # Notify partner via WhatsApp if configured
        self._notify_whatsapp_earned(partner, points, card.points)

        return _json_response({
            'success':        True,
            'partner_name':   partner.name,
            'partner_phone':  partner.phone,
            'points_awarded': points,
            'total_points':   card.points,
            'card_code':      card.code,
        })

    # ── WhatsApp helpers ─────────────────────────────────────────────────────
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
                    'messaging_product': 'whatsapp',
                    'to': phone,
                    'type': 'template',
                    'template': {
                        'name': template,
                        'language': {'code': 'es'},
                        'components': [{
                            'type': 'body',
                            'parameters': [
                                {'type': 'text', 'text': partner.name},
                                {'type': 'text', 'text': str(int(points_earned))},
                                {'type': 'text', 'text': str(int(total_points))},
                            ],
                        }],
                    },
                },
                timeout=5,
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
                    'messaging_product': 'whatsapp',
                    'to': phone,
                    'type': 'template',
                    'template': {
                        'name': template,
                        'language': {'code': 'es'},
                        'components': [{
                            'type': 'body',
                            'parameters': [
                                {'type': 'text', 'text': partner.name},
                                {'type': 'text', 'text': reward.description or reward.reward_type},
                                {'type': 'text', 'text': txn.confirmation_code},
                            ],
                        }],
                    },
                },
                timeout=5,
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
