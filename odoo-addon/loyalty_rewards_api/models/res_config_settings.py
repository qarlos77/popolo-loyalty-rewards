# -*- coding: utf-8 -*-
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
    loyalty_wa_template_welcome = fields.Char(
        string='Template: Welcome',
        config_parameter='loyalty_rewards_api.wa_template_welcome',
        default='loyalty_welcome',
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
