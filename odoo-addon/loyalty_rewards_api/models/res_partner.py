# -*- coding: utf-8 -*-
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    loyalty_birth_date = fields.Date(
        string='Fecha de nacimiento',
        help='Usada para el beneficio de cumpleaños del programa de lealtad (YYYY-MM-DD).',
    )
