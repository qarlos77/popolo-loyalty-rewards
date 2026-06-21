# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    loyalty_birth_date = fields.Date(
        string='Fecha de nacimiento',
        help='Usada para el beneficio de cumpleaños del programa de lealtad (YYYY-MM-DD).',
    )

    # ── POS-callable methods ──────────────────────────────────────────────────

    @api.model
    def pos_check_loyalty_enrollment(self, partner_id):
        """Check enrollment status and required-field completeness for POS."""
        partner = self.env['res.partner'].sudo().browse(partner_id)
        if not partner.exists():
            return {'enrolled': False, 'can_enroll': False, 'missing_fields': [], 'error': 'Partner not found'}

        # Check if already enrolled in any active loyalty program
        loyalty_programs = self.env['loyalty.program'].sudo().search([
            ('program_type', '=', 'loyalty'),
            ('active', '=', True),
        ])
        enrolled = bool(self.env['loyalty.card'].sudo().search([
            ('partner_id', '=', partner_id),
            ('program_id', 'in', loyalty_programs.ids),
        ], limit=1))

        # Validate required fields
        missing = []
        if not partner.name:
            missing.append('Nombre')
        if 'l10n_latam_identification_type_id' in self.env['res.partner']._fields and not partner.l10n_latam_identification_type_id:
            missing.append('Tipo de documento')
        if not partner.vat:
            missing.append('Número de documento')
        if not partner.loyalty_birth_date:
            missing.append('Fecha de nacimiento')
        if not partner.email:
            missing.append('Email')
        if not partner.phone and not partner.mobile:
            missing.append('Teléfono o celular')

        return {
            'enrolled': enrolled,
            'can_enroll': not enrolled and len(missing) == 0,
            'missing_fields': missing,
            'partner_name': partner.name,
        }

    @api.model
    def pos_enroll_in_loyalty(self, partner_id):
        """Enroll a partner in the loyalty program from POS (manual, explicit)."""
        partner = self.env['res.partner'].sudo().browse(partner_id)
        if not partner.exists():
            return {'success': False, 'error': 'Partner not found'}

        # Re-validate required fields server-side
        missing = []
        if not partner.name:
            missing.append('Nombre')
        if 'l10n_latam_identification_type_id' in self.env['res.partner']._fields and not partner.l10n_latam_identification_type_id:
            missing.append('Tipo de documento')
        if not partner.vat:
            missing.append('Número de documento')
        if not partner.loyalty_birth_date:
            missing.append('Fecha de nacimiento')
        if not partner.email:
            missing.append('Email')
        if not partner.phone and not partner.mobile:
            missing.append('Teléfono o celular')

        if missing:
            return {'success': False, 'error': f'Faltan campos: {", ".join(missing)}'}

        loyalty_program = self.env['loyalty.program'].sudo().search([
            ('program_type', '=', 'loyalty'),
            ('active', '=', True),
        ], limit=1)

        if not loyalty_program:
            return {'success': False, 'error': 'No hay programa de lealtad activo'}

        existing = self.env['loyalty.card'].sudo().search([
            ('partner_id', '=', partner_id),
            ('program_id', '=', loyalty_program.id),
        ], limit=1)

        if existing:
            return {'success': False, 'error': 'El cliente ya está inscrito en el programa'}

        card = self.env['loyalty.card'].with_context(action_no_send_mail=True).sudo().create({
            'program_id': loyalty_program.id,
            'partner_id': partner_id,
            'points': 0,
        })

        return {'success': True, 'card_id': card.id, 'program_name': loyalty_program.name}
