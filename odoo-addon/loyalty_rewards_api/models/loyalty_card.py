# -*- coding: utf-8 -*-
import logging
import requests
from odoo import models, api

_logger = logging.getLogger(__name__)


class LoyaltyCard(models.Model):
    _inherit = 'loyalty.card'

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for card in records:
            if (card.program_id.program_type == 'promo_code'
                    and card.partner_id
                    and card.partner_id.email
                    and card.code):
                self._push_coupon_to_wc(card)
        return records

    def _push_coupon_to_wc(self, card):
        icp       = self.env['ir.config_parameter'].sudo()
        wc_url    = (icp.get_param('loyalty_rewards_api.wc_url') or '').rstrip('/')
        wc_key    = icp.get_param('loyalty_rewards_api.wc_consumer_key')
        wc_secret = icp.get_param('loyalty_rewards_api.wc_consumer_secret')
        if not (wc_url and wc_key and wc_secret):
            return

        reward = self.env['loyalty.reward'].sudo().search(
            [('program_id', '=', card.program_id.id)], limit=1
        )
        discount = reward.discount if reward and reward.reward_type == 'discount' else 0

        try:
            resp = requests.post(
                f'{wc_url}/wp-json/wc/v3/coupons',
                auth=(wc_key, wc_secret),
                json={
                    'code':                 card.code,
                    'discount_type':        'percent',
                    'amount':               str(int(discount or 0)),
                    'usage_limit':          1,
                    'usage_limit_per_user': 1,
                    'email_restrictions':   [card.partner_id.email],
                    'description':          f'PopoloPizza Rewards — {card.program_id.name}',
                },
                timeout=8,
            )
            if resp.status_code not in (200, 201):
                _logger.warning(
                    'WC coupon sync failed for code=%s: HTTP %s %s',
                    card.code, resp.status_code, resp.text[:300]
                )
                self._log_wc_sync_error(card, f'HTTP {resp.status_code}: {resp.text[:300]}')
        except Exception as exc:
            _logger.error('WC coupon sync exception for code=%s: %s', card.code, exc)
            self._log_wc_sync_error(card, str(exc))

    def _log_wc_sync_error(self, card, message):
        try:
            self.env['loyalty.sync.log'].sudo().create({
                'external_order_id': f'WC-COUPON-{card.code}',
                'source':            'wc_coupon',
                'email':             card.partner_id.email or '',
                'state':             'error',
                'message':           message,
            })
        except Exception:
            pass
