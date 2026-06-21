# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def confirm_coupon_programs(self, coupon_data):
        """Override to block automatic loyalty card creation from POS.

        The POS frontend sends negative coupon IDs for new loyalty cards it wants
        to auto-create when an order qualifies a program. We strip those out for
        loyalty-type programs so that enrollment only happens through our manual
        POS toggle (pos_enroll_in_loyalty on res.partner).

        Existing cards (positive IDs) and non-loyalty programs (gift cards,
        ewallets) are left untouched.
        """
        filtered = {}
        for k, v in coupon_data.items():
            if int(k) < 0:
                program = self.env['loyalty.program'].browse(v.get('program_id', 0))
                if program.exists() and program.program_type == 'loyalty':
                    continue
            filtered[k] = v
        return super().confirm_coupon_programs(filtered)
