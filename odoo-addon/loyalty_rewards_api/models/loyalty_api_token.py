# -*- coding: utf-8 -*-
import secrets
from datetime import datetime, timedelta
from odoo import api, fields, models


class LoyaltyApiToken(models.Model):
    _name = 'loyalty.api.token'
    _description = 'Loyalty Web App Auth Token'
    _order = 'create_date desc'

    partner_id = fields.Many2one('res.partner', required=True, ondelete='cascade', index=True)
    token = fields.Char(required=True, index=True, copy=False)
    expires_at = fields.Datetime(required=True)
    last_used = fields.Datetime()
    device_hint = fields.Char()
    active = fields.Boolean(default=True)

    @api.model
    def generate_for_partner(self, partner_id, device_hint=None):
        self.search([('partner_id', '=', partner_id), ('active', '=', True)]).write({'active': False})
        token = secrets.token_urlsafe(40)
        expires_at = datetime.now() + timedelta(days=30)
        record = self.create({
            'partner_id': partner_id,
            'token': token,
            'expires_at': expires_at,
            'device_hint': device_hint,
        })
        return record

    @api.model
    def validate(self, token_str):
        record = self.search([
            ('token', '=', token_str),
            ('active', '=', True),
            ('expires_at', '>', fields.Datetime.now()),
        ], limit=1)
        if record:
            record.last_used = fields.Datetime.now()
        return record
