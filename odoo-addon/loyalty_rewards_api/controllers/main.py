# -*- coding: utf-8 -*-
import json
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
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
    )


def _auth_partner(req):
    """Validate Bearer token and return (token_record, partner) or (None, None)."""
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
            return _json_response({'error': 'identifier required (DNI or phone)'}, 400)

        env = request.env['res.partner'].sudo()

        # Search by DNI (vat) or phone
        partner = env.search([('vat', '=', identifier), ('active', '=', True)], limit=1)
        if not partner:
            partner = env.search([
                '|',
                ('phone', '=', identifier),
                ('mobile', '=', identifier),
                ('active', '=', True),
            ], limit=1)

        if not partner:
            return _json_response({'error': 'Customer not found'}, 404)

        # Check they have at least one loyalty card
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
                'phone': partner.phone or partner.mobile,
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
                'phone': partner.phone or partner.mobile,
                'vat': partner.vat,
                'image_url': f'/web/image/res.partner/{partner.id}/image_128',
            },
            'total_points': total_points,
            'cards': [_card_to_dict(c) for c in cards],
        })

    # ── Real-time balance (for polling) ──────────────────────────────────────
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
        reward_model = request.env['loyalty.reward'].sudo()
        rewards = reward_model.search([
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

        # App redemptions
        txns = request.env['loyalty.transaction'].sudo().search([
            ('partner_id', '=', partner.id),
        ], limit=limit, order='date desc')

        # POS orders that earned points
        pos_orders = request.env['pos.order'].sudo().search([
            ('partner_id', '=', partner.id),
            ('loyalty_points', '!=', 0),
        ], limit=limit, order='date_order desc')

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

        for order in pos_orders:
            pts = getattr(order, 'loyalty_points', 0)
            history.append({
                'id': f'pos_{order.id}',
                'type': 'earned',
                'description': f'Compra #{order.name}',
                'points': pts,
                'date': order.date_order.isoformat(),
                'amount': order.amount_total,
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
        card_id = body.get('card_id')
        if not reward_id or not card_id:
            return _json_response({'error': 'reward_id and card_id required'}, 400)

        env = request.env
        card = env['loyalty.card'].sudo().browse(card_id)
        reward = env['loyalty.reward'].sudo().browse(reward_id)

        if not card.exists() or card.partner_id.id != partner.id:
            return _json_response({'error': 'Card not found'}, 404)
        if not reward.exists():
            return _json_response({'error': 'Reward not found'}, 404)
        if card.points < reward.required_points:
            return _json_response({'error': 'Insufficient points'}, 400)

        # Anti-double-redemption: check for recent pending txn
        from datetime import datetime
        recent = env['loyalty.transaction'].sudo().search([
            ('partner_id', '=', partner.id),
            ('reward_id', '=', reward_id),
            ('state', '=', 'pending'),
            ('lock_expires', '>', fields.Datetime.now()),
        ], limit=1)
        if recent:
            return _json_response({
                'error': 'A redemption for this reward is already pending',
                'pending_code': recent.confirmation_code,
                'expires_at': recent.lock_expires.isoformat(),
            }, 409)

        txn = env['loyalty.transaction'].sudo().create_redemption(card, reward)

        # Deduct points
        card.sudo().write({'points': card.points - reward.required_points})

        # Send WhatsApp notification
        self._notify_whatsapp_redeemed(partner, reward, txn)
        # Send email
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

    # ── Confirm redemption (called by cashier's POS scan) ───────────────────
    @http.route('/api/loyalty/confirm-redeem', type='http', auth='none',
                methods=['POST'], csrf=False)
    def confirm_redeem(self, **kw):
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            return _json_response({'error': 'Invalid JSON'}, 400)

        code = (body.get('code') or '').upper()
        txn = request.env['loyalty.transaction'].sudo().search([
            ('confirmation_code', '=', code),
            ('state', '=', 'pending'),
        ], limit=1)

        if not txn:
            return _json_response({'error': 'Invalid or expired code'}, 404)

        if txn.lock_expires < fields.Datetime.now():
            txn.write({'state': 'expired'})
            # Refund points
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

    # ── Lookup by DNI (for cashier) ──────────────────────────────────────────
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
            '|', ('vat', '=', identifier), ('mobile', '=', identifier)
        ], limit=1)

        if not partner:
            return _json_response({'error': 'Customer not found'}, 404)

        cards = env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
        return _json_response({
            'partner': {'id': partner.id, 'name': partner.name, 'vat': partner.vat},
            'cards': [_card_to_dict(c) for c in cards],
            'total_points': sum(c.points for c in cards),
        })

    # ── WhatsApp helpers ─────────────────────────────────────────────────────
    def _notify_whatsapp_redeemed(self, partner, reward, txn):
        icp = request.env['ir.config_parameter'].sudo()
        phone_id = icp.get_param('loyalty_rewards_api.wa_phone_id')
        token = icp.get_param('loyalty_rewards_api.wa_token')
        template = icp.get_param('loyalty_rewards_api.wa_template_redeemed', 'loyalty_redeemed')
        phone = (partner.mobile or partner.phone or '').replace(' ', '').replace('+', '')
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
