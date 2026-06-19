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
    return {
        'id': reward.id,
        'program_id': reward.program_id.id,
        'name': reward.description or reward.reward_type,
        'required_points': reward.required_points,
        'reward_type': reward.reward_type,
        'affordable': card_points >= reward.required_points,
        'discount': reward.discount if reward.reward_type == 'discount' else None,
    }


def _find_partner_by_email(env, email):
    """Case-insensitive email search across active partners."""
    email = (email or '').strip().lower()
    if not email:
        return None
    partner = env['res.partner'].sudo().search(
        [('email', '=ilike', email), ('active', '=', True)], limit=1
    )
    return partner if partner else None


class LoyaltyAPI(http.Controller):

    # ── CORS preflight ───────────────────────────────────────────────────────
    @http.route('/api/loyalty/<path:path>', type='http', auth='none',
                methods=['OPTIONS'], csrf=False)
    def cors_preflight(self, path, **kw):
        return _json_response({})

    # ── Auth: login by email ─────────────────────────────────────────────────
    @http.route('/api/loyalty/auth', type='http', auth='none',
                methods=['POST'], csrf=False)
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
                'id': partner.id,
                'name': partner.name,
                'email': partner.email or '',
                'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
        })

    # ── Profile + cards ──────────────────────────────────────────────────────
    @http.route('/api/loyalty/me', type='http', auth='none',
                methods=['GET'], csrf=False)
    def me(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'partner': {
                'id': partner.id,
                'name': partner.name,
                'email': partner.email or '',
                'phone': partner.phone or '',
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
            'total_points': sum(c.points for c in cards),
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
        card_pts = {c.program_id.id: c.points for c in cards}

        rewards = request.env['loyalty.reward'].sudo().search([
            ('program_id', 'in', cards.mapped('program_id').ids),
            ('reward_type', 'in', ['free_product', 'discount', 'gift_card']),
        ], order='required_points asc')

        return _json_response({
            'total_points': sum(card_pts.values()),
            'rewards': [_reward_to_dict(r, card_pts.get(r.program_id.id, 0)) for r in rewards],
        })

    # ── Transaction history ──────────────────────────────────────────────────
    @http.route('/api/loyalty/history', type='http', auth='none',
                methods=['GET'], csrf=False)
    def history(self, **kw):
        token, partner = _auth_partner(request)
        if not partner:
            return _json_response({'error': 'Unauthorized'}, 401)

        limit = int(request.httprequest.args.get('limit', 20))
        txns = request.env['loyalty.transaction'].sudo().search(
            [('partner_id', '=', partner.id)], limit=limit, order='date desc'
        )
        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        lh_records = request.env['loyalty.history'].sudo().search(
            [('card_id', 'in', cards.ids)], limit=limit, order='id desc'
        )

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

        card   = request.env['loyalty.card'].sudo().browse(card_id)
        reward = request.env['loyalty.reward'].sudo().browse(reward_id)

        if not card.exists() or card.partner_id.id != partner.id:
            return _json_response({'error': 'Card not found'}, 404)
        if not reward.exists():
            return _json_response({'error': 'Reward not found'}, 404)
        if card.points < reward.required_points:
            return _json_response({'error': 'Insufficient points'}, 400)

        recent = request.env['loyalty.transaction'].sudo().search([
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

        txn = request.env['loyalty.transaction'].sudo().create_redemption(card, reward)
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

    # ── Confirm redemption ───────────────────────────────────────────────────
    @http.route('/api/loyalty/confirm-redeem', type='http', auth='none',
                methods=['POST'], csrf=False)
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
            'success': True,
            'partner_name': txn.partner_id.name,
            'reward_name': txn.reward_id.description or txn.reward_id.reward_type,
            'points_used': txn.points_used,
            'confirmed_at': txn.redeemed_at.isoformat(),
        })

    # ── Lookup (cashier: email / DNI / phone) ────────────────────────────────
    @http.route('/api/loyalty/lookup', type='http', auth='none',
                methods=['POST'], csrf=False)
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

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'partner': {
                'id': partner.id, 'name': partner.name,
                'email': partner.email, 'vat': partner.vat,
            },
            'cards': [_card_to_dict(c) for c in cards],
            'total_points': sum(c.points for c in cards),
        })

    # ── Points by email (WooCommerce checkout widget) ────────────────────────
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
            return _json_response({'found': False, 'email': email}, 200)

        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'found':        True,
            'partner_name': partner.name,
            'email':        partner.email,
            'total_points': sum(c.points for c in cards),
            'cards': [_card_to_dict(c) for c in cards],
        })

    # ── WooCommerce sync-order (match by email) ──────────────────────────────
    @http.route('/api/loyalty/sync-order', type='http', auth='none',
                methods=['POST'], csrf=False)
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

        order_id      = str(body.get('order_id', '')).strip()
        email_raw     = str(body.get('customer_email', '')).strip().lower()
        phone_raw     = str(body.get('phone', '')).strip()
        order_total   = float(body.get('order_total', 0))
        currency      = body.get('currency', 'PEN')
        source        = body.get('source', 'woocommerce')
        customer_name = str(body.get('customer_name', '')).strip()

        if not order_id or not email_raw:
            return _json_response({'error': 'order_id and customer_email are required'}, 400)

        SyncLog = request.env['loyalty.sync.log'].sudo()

        # --- Idempotency ---
        duplicate = SyncLog.search([
            ('external_order_id', '=', order_id),
            ('source',            '=', source),
            ('state',             '=', 'synced'),
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

        # --- Match by email, auto-create if not found ---
        partner = _find_partner_by_email(request.env, email_raw)
        partner_created = False

        if not partner:
            name = customer_name or f'Cliente WC #{order_id}'
            partner = request.env['res.partner'].sudo().create({
                'name':          name,
                'email':         email_raw,
                'phone':         phone_raw or False,
                'customer_rank': 1,
            })
            partner_created = True

        # --- Find or create loyalty card ---
        cards = request.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
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

        card = cards[0] if len(cards) > 1 else cards

        # --- Calculate and award points ---
        ratio  = float(icp.get_param('loyalty_rewards_api.points_ratio', '0.1'))
        points = int(order_total * ratio)

        if points <= 0:
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

        card.sudo().write({'points': card.points + points})
        request.env['loyalty.history'].sudo().create({
            'card_id': card.id, 'description': f'Compra por la web #{order_id}',
            'issued': points, 'used': 0,
        })

        created_note = ' (contacto creado automáticamente)' if partner_created else ''
        SyncLog.create({
            'external_order_id': order_id, 'source': source,
            'email': email_raw, 'phone': phone_raw, 'partner_id': partner.id,
            'order_total': order_total, 'currency': currency,
            'points_awarded': points, 'state': 'synced',
            'message': f'OK — {points} pts. Saldo: {card.points}{created_note}',
        })

        self._notify_whatsapp_earned(partner, points, card.points)

        return _json_response({
            'success':         True,
            'partner_name':    partner.name,
            'partner_email':   partner.email,
            'partner_created': partner_created,
            'points_awarded':  points,
            'total_points':    card.points,
            'card_code':       card.code,
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
