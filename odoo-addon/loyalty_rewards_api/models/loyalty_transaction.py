# -*- coding: utf-8 -*-
from odoo import api, fields, models


class LoyaltyTransaction(models.Model):
    """Tracks redemptions made via the Loyalty Web App."""
    _name = 'loyalty.transaction'
    _description = 'Loyalty Web App Transaction'
    _order = 'date desc'

    partner_id = fields.Many2one('res.partner', required=True, index=True)
    card_id = fields.Many2one('loyalty.card', required=True, index=True)
    reward_id = fields.Many2one('loyalty.reward', required=True)
    points_used = fields.Float(required=True)
    state = fields.Selection([
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ], default='pending', required=True)
    date = fields.Datetime(default=fields.Datetime.now, required=True)
    confirmation_code = fields.Char(readonly=True)
    redeemed_at = fields.Datetime()
    lock_expires = fields.Datetime()
    notes = fields.Text()

    @api.model
    def create_redemption(self, card, reward):
        import secrets
        from datetime import datetime, timedelta
        lock_expires = datetime.now() + timedelta(minutes=10)
        code = secrets.token_hex(4).upper()
        return self.create({
            'partner_id': card.partner_id.id,
            'card_id': card.id,
            'reward_id': reward.id,
            'points_used': reward.required_points,
            'state': 'pending',
            'confirmation_code': code,
            'lock_expires': lock_expires,
        })
