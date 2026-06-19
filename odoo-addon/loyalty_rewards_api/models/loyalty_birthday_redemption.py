# -*- coding: utf-8 -*-
from odoo import fields, models


class LoyaltyBirthdayRedemption(models.Model):
    _name        = 'loyalty.birthday.redemption'
    _description = 'Canje de beneficio de cumpleaños'
    _order       = 'redeemed_at desc'

    partner_id   = fields.Many2one('res.partner', string='Cliente', required=True, ondelete='cascade', index=True)
    year         = fields.Integer(string='Año', required=True)
    redeemed_at  = fields.Datetime(string='Fecha de canje', required=True)
    product_id   = fields.Many2one('product.product', string='Producto regalado')
    product_name = fields.Char(string='Nombre del producto')
    redeemed_by  = fields.Char(string='Canjeado por')
    notes        = fields.Char(string='Notas')
