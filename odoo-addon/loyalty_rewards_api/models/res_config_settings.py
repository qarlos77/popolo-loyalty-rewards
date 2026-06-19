# -*- coding: utf-8 -*-
import secrets
import string
from odoo import fields, models

_ALPHABET = string.ascii_letters + string.digits  # a-z A-Z 0-9


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    loyalty_wa_phone_id = fields.Char(
        string='WhatsApp Phone Number ID',
        config_parameter='loyalty_rewards_api.wa_phone_id',
    )
    loyalty_wa_token = fields.Char(
        string='WhatsApp Permanent Token',
        config_parameter='loyalty_rewards_api.wa_token',
    )
    loyalty_wa_template_redeemed = fields.Char(
        string='Template: Redeemed',
        config_parameter='loyalty_rewards_api.wa_template_redeemed',
        default='loyalty_redeemed',
    )
    loyalty_wa_template_earned = fields.Char(
        string='Template: Points Earned',
        config_parameter='loyalty_rewards_api.wa_template_earned',
        default='loyalty_earned',
    )
    loyalty_app_url = fields.Char(
        string='Rewards App URL',
        config_parameter='loyalty_rewards_api.app_url',
        default='https://rewards.popolopizza.com',
    )
    loyalty_pin_required = fields.Boolean(
        string='Require PIN login',
        config_parameter='loyalty_rewards_api.pin_required',
        default=False,
    )
    loyalty_sync_api_key = fields.Char(
        string='Sync API Key',
        config_parameter='loyalty_rewards_api.sync_api_key',
        help='Clave compartida con WooCommerce. Cópiala en el plugin de WordPress.',
    )
    loyalty_points_ratio = fields.Float(
        string='Puntos por unidad de moneda',
        config_parameter='loyalty_rewards_api.points_ratio',
        default=0.1,
        help='Puntos por cada 1 unidad de moneda. Ejemplo: 0.1 = 1 punto por S/.10.',
    )

    def action_generate_sync_api_key(self):
        key = ''.join(secrets.choice(_ALPHABET) for _ in range(16))
        self.env['ir.config_parameter'].sudo().set_param(
            'loyalty_rewards_api.sync_api_key', key
        )
        self.loyalty_sync_api_key = key
        return {'type': 'ir.actions.client', 'tag': 'reload'}
