# -*- coding: utf-8 -*-
import pytz
from datetime import datetime
from odoo import api, fields, models


class LoyaltyBirthdayRedemption(models.Model):
    _name        = 'loyalty.birthday.redemption'
    _description = 'Canje de beneficio de cumpleaños'
    _order       = 'redeemed_at desc'

    partner_id     = fields.Many2one('res.partner', string='Cliente', required=True, ondelete='cascade', index=True)
    year           = fields.Integer(string='Año', required=True)
    redeemed_at    = fields.Datetime(string='Fecha', required=True)
    source         = fields.Selection([
        ('cashier',   'Cajero (en local)'),
        ('automatic', 'Automático (sistema)'),
    ], string='Origen', default='cashier', required=True)
    product_id     = fields.Many2one('product.product', string='Producto regalado')
    product_name   = fields.Char(string='Producto')
    points_awarded = fields.Integer(string='Puntos otorgados')
    redeemed_by    = fields.Char(string='Canjeado por')
    notes          = fields.Char(string='Notas')

    @api.model
    def _cron_award_birthday_points(self):
        """Cron diario: otorga puntos de cumpleaños a clientes cuyo cumpleaños es hoy (hora Perú)."""
        peru_tz    = pytz.timezone('America/Lima')
        today_peru = datetime.now(peru_tz).date()

        icp          = self.env['ir.config_parameter'].sudo()
        birthday_pts = int(float(icp.get_param('loyalty_rewards_api.birthday_points', '0')))

        if birthday_pts <= 0:
            return

        # Find all partners with a registered birth date
        partners = self.env['res.partner'].sudo().search([
            ('loyalty_birth_date', '!=', False),
            ('active', '=', True),
        ])

        # Filter: month and day match today (Peru)
        bday_partners = partners.filtered(
            lambda p: p.loyalty_birth_date.month == today_peru.month
                   and p.loyalty_birth_date.day  == today_peru.day
        )

        for partner in bday_partners:
            # Idempotency: skip if already processed this year
            already = self.sudo().search([
                ('partner_id', '=', partner.id),
                ('year',       '=', today_peru.year),
                ('source',     '=', 'automatic'),
            ], limit=1)
            if already:
                continue

            cards = self.env['loyalty.card'].sudo().search([('partner_id', '=', partner.id)])
            if not cards:
                continue

            card = cards[0]
            card.sudo().write({'points': card.points + birthday_pts})

            try:
                self.env['loyalty.history'].sudo().create({
                    'card_id':     card.id,
                    'description': f'Puntos de cumpleaños {today_peru.year}',
                    'issued':      birthday_pts,
                    'used':        0,
                })
            except Exception:
                pass

            self.sudo().create({
                'partner_id':     partner.id,
                'year':           today_peru.year,
                'redeemed_at':    fields.Datetime.now(),
                'source':         'automatic',
                'points_awarded': birthday_pts,
                'notes':          'Puntos de cumpleaños otorgados automáticamente por el sistema.',
            })
