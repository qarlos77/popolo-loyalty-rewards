# -*- coding: utf-8 -*-
import logging
import threading

import requests as _req

from odoo import api, models

_logger = logging.getLogger(__name__)

# Campos de product.template relevantes para WooCommerce
_WC_FIELDS = frozenset({
    'name', 'list_price', 'description_sale', 'image_1920',
    'pos_categ_ids', 'attribute_line_ids', 'active', 'available_in_pos',
})


class ProductTemplateWebhook(models.Model):
    _inherit = 'product.template'

    # ── API pública ───────────────────────────────────────────
    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        self._schedule_wp_webhook('create', records.ids)
        return records

    def write(self, vals):
        result = super().write(vals)
        if result and _WC_FIELDS & vals.keys():
            self._schedule_wp_webhook('write', self.ids)
        return result

    def unlink(self):
        ids = self.ids[:]
        result = super().unlink()
        if result:
            self._schedule_wp_webhook('unlink', ids)
        return result

    # ── Internos ──────────────────────────────────────────────
    def _schedule_wp_webhook(self, action: str, ids: list):
        """Registra el envío del webhook para después del commit."""
        icp = self.env['ir.config_parameter'].sudo()
        url    = (icp.get_param('loyalty_rewards_api.wp_webhook_url') or '').strip()
        secret = (icp.get_param('loyalty_rewards_api.wp_webhook_secret') or '').strip()
        if not url or not secret:
            return

        def _fire(url=url, secret=secret, action=action, ids=ids):
            def _call():
                for oid in ids:
                    try:
                        _req.post(
                            url,
                            json={'action': action, 'id': oid},
                            headers={'X-Odoo-Secret': secret},
                            timeout=6,
                        )
                        _logger.debug('Odoo Connect webhook sent: %s #%s', action, oid)
                    except Exception as exc:
                        _logger.warning('Odoo Connect webhook error (%s #%s): %s', action, oid, exc)

            threading.Thread(target=_call, daemon=True).start()

        # Ejecutar después de que el commit sea exitoso
        self.env.cr.postcommit.add(_fire)
