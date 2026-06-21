/** @odoo-module */

import { useState, onWillRender } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ControlButtons.prototype, {

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    setup() {
        super.setup(...arguments);
        this.birthdayInfo    = useState({ data: null, partnerId: null });
        this.enrollmentInfo  = useState({ data: null, partnerId: null });

        onWillRender(() => {
            const partner = this.pos.getOrder()?.getPartner();
            const newId   = partner?.id ?? null;

            if (newId !== this.birthdayInfo.partnerId) {
                this.birthdayInfo.partnerId = newId;
                this.birthdayInfo.data      = null;
                if (newId) this._bgFetchBirthdayInfo(newId);
            }

            if (newId !== this.enrollmentInfo.partnerId) {
                this.enrollmentInfo.partnerId = newId;
                this.enrollmentInfo.data      = null;
                if (newId) this._bgFetchEnrollmentInfo(newId);
            }
        });
    },

    // ── Birthday fetch ────────────────────────────────────────────────────────

    async _bgFetchBirthdayInfo(partnerId) {
        try {
            const info = await this.pos.data.call(
                "loyalty.birthday.redemption", "pos_get_birthday_info", [partnerId]
            );
            if (this.birthdayInfo.partnerId === partnerId) {
                this.birthdayInfo.data = info;
            }
        } catch { /* ignore */ }
    },

    async _fetchBirthdayInfo(partnerId) {
        try {
            const info = await this.pos.data.call(
                "loyalty.birthday.redemption", "pos_get_birthday_info", [partnerId]
            );
            this.birthdayInfo.partnerId = partnerId;
            this.birthdayInfo.data      = info;
            return info;
        } catch {
            return { is_today: false, benefit_available: false };
        }
    },

    // ── Enrollment fetch ──────────────────────────────────────────────────────

    async _bgFetchEnrollmentInfo(partnerId) {
        try {
            const info = await this.pos.data.call(
                "res.partner", "pos_check_loyalty_enrollment", [partnerId]
            );
            if (this.enrollmentInfo.partnerId === partnerId) {
                this.enrollmentInfo.data = info;
            }
        } catch { /* ignore */ }
    },

    async _fetchEnrollmentInfo(partnerId) {
        try {
            const info = await this.pos.data.call(
                "res.partner", "pos_check_loyalty_enrollment", [partnerId]
            );
            this.enrollmentInfo.partnerId = partnerId;
            this.enrollmentInfo.data      = info;
            return info;
        } catch {
            return { enrolled: false, can_enroll: false, missing_fields: [] };
        }
    },

    // ── Count: highlight button when birthday is available ────────────────────

    getPotentialRewards() {
        const rewards  = super.getPotentialRewards();
        const bd       = this.birthdayInfo?.data;
        const order    = this.pos.getOrder();
        const partner  = order?.getPartner();
        const pending  = order?._birthdayGift?.partnerId === partner?.id;

        if (bd?.is_today && bd.benefit_available && !pending) {
            rewards.push({ _birthdayReward: true, _data: bd });
        }
        return rewards;
    },

    // ── Rewards popup ─────────────────────────────────────────────────────────

    async clickRewards() {
        const order   = this.pos.getOrder();
        const partner = order?.getPartner();

        // Fetch fresh data before showing popup
        let bd         = null;
        let enrollment = null;
        if (partner?.id) {
            [bd, enrollment] = await Promise.all([
                this._fetchBirthdayInfo(partner.id),
                this._fetchEnrollmentInfo(partner.id),
            ]);
        }

        // Loyalty rewards (exclude our virtual birthday sentinel)
        const loyaltyRewards = super.getPotentialRewards();
        const list = loyaltyRewards.map((r) => ({
            id:          r.reward.id,
            label:       r.reward.program_id.name,
            description: `Agregar "${r.reward.description}"`,
            item:        { _type: "loyalty", reward: r.reward, coupon_id: r.coupon_id, potentialQty: r.potentialQty },
        }));

        // Inject birthday entry at top when today is birthday
        if (partner && bd?.is_today) {
            const pending      = order?._birthdayGift?.partnerId === partner.id;
            const productName  = bd.product?.name || _t("Regalo");

            if (pending) {
                list.unshift({
                    id:          "birthday_pending",
                    label:       "🎂 " + _t("Regalo de Cumpleaños") + " — " + productName,
                    description: "⏳ " + _t("Agregado a esta orden"),
                    item:        { _type: "birthday_pending" },
                });
            } else if (bd.benefit_available) {
                list.unshift({
                    id:          "birthday_reward",
                    label:       "🎂 " + _t("Regalo de Cumpleaños") + " — " + productName,
                    description: "✅ " + _t("GRATIS · Solo canjeable en el local"),
                    item:        { _type: "birthday", ...bd },
                });
            } else {
                list.unshift({
                    id:          "birthday_used",
                    label:       "🎂 " + _t("Regalo de Cumpleaños"),
                    description: "⚠️  " + _t("Ya fue canjeado este año"),
                    item:        { _type: "birthday_disabled" },
                });
            }
        }

        // Inject enrollment entry when there is a partner
        if (partner) {
            if (enrollment?.enrolled) {
                list.push({
                    id:          "loyalty_enrolled",
                    label:       "⭐ " + _t("Programa de Lealtad"),
                    description: "✅ " + _t("Cliente ya inscrito en el programa"),
                    item:        { _type: "enrolled" },
                });
            } else if (enrollment?.can_enroll) {
                list.push({
                    id:          "loyalty_enroll",
                    label:       "⭐ " + _t("Inscribir al Programa de Lealtad"),
                    description: "📋 " + _t("Requiere confirmación del cliente"),
                    item:        { _type: "enrollment", enrollment },
                });
            } else if (enrollment && !enrollment.enrolled) {
                const missing = enrollment.missing_fields?.join(", ") || _t("datos incompletos");
                list.push({
                    id:          "loyalty_enroll_incomplete",
                    label:       "⭐ " + _t("Inscribir al Programa de Lealtad"),
                    description: "⚠️  " + _t("Faltan datos: ") + missing,
                    item:        { _type: "enrollment_incomplete", missing: enrollment.missing_fields },
                });
            }
        }

        if (list.length === 0) {
            this.notification.add(_t("No hay recompensas disponibles"), { type: "info" });
            return;
        }

        const selected = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Recompensas disponibles"),
            list,
        });

        if (!selected) return;

        if (selected._type === "birthday_pending") return;

        if (selected._type === "birthday_disabled") {
            this.notification.add(
                _t("Este beneficio de cumpleaños ya fue canjeado este año"),
                { type: "warning" }
            );
            return;
        }

        if (selected._type === "birthday") {
            await this._applyBirthdayReward(selected, partner);
            return;
        }

        if (selected._type === "enrolled") {
            this.notification.add(_t("El cliente ya está inscrito en el programa de lealtad"), { type: "info" });
            return;
        }

        if (selected._type === "enrollment_incomplete") {
            const missing = selected.missing?.join(", ") || _t("datos incompletos");
            this.notification.add(_t("Faltan datos requeridos: ") + missing, { type: "warning" });
            return;
        }

        if (selected._type === "enrollment") {
            await this._applyLoyaltyEnrollment(partner);
            return;
        }

        // Normal loyalty reward
        this._applyReward(selected.reward, selected.coupon_id, selected.potentialQty);
    },

    // ── Apply birthday gift ───────────────────────────────────────────────────

    async _applyBirthdayReward(birthdayData, partner) {
        const product = birthdayData.product;
        if (!product) {
            this.notification.add(_t("Producto de regalo no configurado en Ajustes"), { type: "danger" });
            return;
        }

        const cashierName = this.pos.cashier?.name || "Cajero POS";

        let result;
        try {
            result = await this.pos.data.call(
                "loyalty.birthday.redemption", "pos_redeem_birthday",
                [birthdayData.partner_id, cashierName]
            );
        } catch {
            this.notification.add(_t("Error al registrar el canje de cumpleaños"), { type: "danger" });
            return;
        }

        if (!result?.success) {
            this.notification.add(result?.error || _t("No se pudo canjear el regalo"), { type: "warning" });
            return;
        }

        let posProduct  = this.pos.models["product.product"].get(product.product_id);
        let posTemplate = this.pos.models["product.template"].get(product.product_template_id);

        if (!posProduct || !posTemplate) {
            try {
                await this.pos.data.read("product.template", [product.product_template_id]);
                await this.pos.data.searchRead(
                    "product.product",
                    [["product_tmpl_id", "=", product.product_template_id]],
                    this.pos.data.fields["product.product"]
                );
                posProduct  = this.pos.models["product.product"].get(product.product_id);
                posTemplate = this.pos.models["product.template"].get(product.product_template_id);
            } catch { /* ignored */ }
        }

        if (!posProduct || !posTemplate) {
            this.notification.add(
                _t("Producto no disponible en el POS. Agréguelo al catálogo de la sesión."),
                { type: "danger" }
            );
            return;
        }

        await this.pos.addLineToCurrentOrder(
            { product_id: posProduct, product_tmpl_id: posTemplate, qty: 1, price_unit: 0 },
            {}
        );

        const order = this.pos.getOrder();
        order._birthdayGift = { partnerId: partner.id };
        this.birthdayInfo.data = { ...birthdayData, benefit_available: false };

        this.notification.add(
            "🎂 " + _t("Regalo de cumpleaños agregado: ") + product.name,
            { type: "success" }
        );
    },

    // ── Apply loyalty enrollment ──────────────────────────────────────────────

    async _applyLoyaltyEnrollment(partner) {
        // Ask cashier to confirm customer's explicit consent
        const confirmed = await new Promise((resolve) => {
            this.dialog.add(ConfirmationDialog, {
                title: _t("Confirmar inscripción"),
                body: _t("¿El cliente confirma que desea inscribirse al programa de lealtad de Popolo Pizza?"),
                confirmLabel: _t("Sí, inscribir"),
                cancelLabel: _t("Cancelar"),
                confirm: () => resolve(true),
                cancel: () => resolve(false),
            });
        });

        if (!confirmed) return;

        let result;
        try {
            result = await this.pos.data.call(
                "res.partner", "pos_enroll_in_loyalty", [partner.id]
            );
        } catch {
            this.notification.add(_t("Error al inscribir al cliente"), { type: "danger" });
            return;
        }

        if (!result?.success) {
            this.notification.add(result?.error || _t("No se pudo inscribir al cliente"), { type: "warning" });
            return;
        }

        // Update local enrollment cache
        this.enrollmentInfo.data = { enrolled: true, can_enroll: false, missing_fields: [] };

        this.notification.add(
            "⭐ " + _t("Cliente inscrito exitosamente en ") + (result.program_name || _t("el programa de lealtad")),
            { type: "success" }
        );
    },
});
