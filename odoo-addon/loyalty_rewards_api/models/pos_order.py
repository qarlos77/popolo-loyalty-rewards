# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def confirm_coupon_programs(self, coupon_data):
        # Block automatic loyalty card creation from POS orders.
        # The frontend sends negative coupon IDs for new cards it wants to create;
        # we strip those for loyalty programs so enrollment stays manual-only.
        filtered = {}
        for k, v in coupon_data.items():
            if int(k) < 0:
                program = self.env['loyalty.program'].browse(v.get('program_id', 0))
                if program.exists() and program.program_type == 'loyalty':
                    continue
            filtered[k] = v
        return super().confirm_coupon_programs(filtered)
