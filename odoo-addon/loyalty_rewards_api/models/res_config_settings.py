# -*- coding: utf-8 -*-
import secrets
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # WhatsApp (Meta Cloud API)
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

    # App settings
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

    # WooCommerce / external sync
    loyalty_sync_api_key = fields.Char(
        string='Sync API Key',
        config_parameter='loyalty_rewards_api.sync_api_key',
        help='Clave secreta que WooCommerce envía en el header X-API-Key.',
    )
    loyalty_points_ratio = fields.Float(
        string='Puntos por unidad de moneda',
        config_parameter='loyalty_rewards_api.points_ratio',
        default=0.1,
        help='Puntos por cada 1 unidad de moneda. Ejemplo: 0.1 = 1 punto por S/.10.',
    )

    def action_generate_sync_api_key(self):
        """Generate a cryptographically secure API key and save it immediately."""
        key = secrets.token_hex(32)

        # Persist directly so it survives without needing the Save button
        self.env['ir.config_parameter'].sudo().set_param(
            'loyalty_rewards_api.sync_api_key', key
        )
        # Also set on the transient record so the field reflects it
        self.loyalty_sync_api_key = key

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'API Key generada y guardada',
                'message': key,
                'type': 'success',
                'sticky': True,
                'next': {'type': 'ir.actions.client', 'tag': 'reload'},
            },
        }
