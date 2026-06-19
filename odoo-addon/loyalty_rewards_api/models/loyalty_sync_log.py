# -*- coding: utf-8 -*-
from odoo import fields, models


class LoyaltySyncLog(models.Model):
    _name = 'loyalty.sync.log'
    _description = 'Loyalty Sync Log (WooCommerce)'
    _order = 'create_date desc'
    _rec_name = 'external_order_id'

    external_order_id = fields.Char(string='External Order ID', required=True, index=True)
    source            = fields.Char(string='Source', default='woocommerce', index=True)
    email             = fields.Char(string='Email sent')
    phone             = fields.Char(string='Phone sent')
    partner_id        = fields.Many2one('res.partner', string='Partner matched', ondelete='set null')
    order_total       = fields.Float(string='Order Total')
    currency          = fields.Char(string='Currency', default='PEN')
    points_awarded    = fields.Float(string='Points Awarded')
    state             = fields.Selection([
        ('synced',     'Synced'),
        ('duplicate',  'Duplicate'),
        ('no_partner', 'Partner not found'),
        ('no_card',    'No loyalty card'),
        ('error',      'Error'),
    ], string='State', required=True, default='error', index=True)
    message = fields.Text(string='Detail')
    create_date = fields.Datetime(readonly=True)
