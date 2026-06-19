/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ControlButtons.prototype, {

    /** Fetch birthday info for the current order partner from the backend. */
    async _getBirthdayInfo(partnerId) {
        try {
            return await this.pos.data.call(
                "loyalty.birthday.redemption",
                "pos_get_birthday_info",
                [partnerId]
            );
        } catch {
            return { is_today: false, benefit_available: false };
        }
    },

    /** Add the gift product at price 0 and record the cashier redemption. */
    async _applyBirthdayReward(birthdayInfo) {
        const product = birthdayInfo.product;
        if (!product) {
            this.notification.add(_t("Producto de regalo no configurado en Ajustes"), { type: "danger" });
            return;
        }

        const cashierName = this.pos.cashier?.name || "Cajero POS";

        // Record redemption on backend first (idempotency guard)
        let result;
        try {
            result = await this.pos.data.call(
                "loyalty.birthday.redemption",
                "pos_redeem_birthday",
                [birthdayInfo.partner_id, cashierName]
            );
        } catch (e) {
            this.notification.add(_t("Error al registrar el canje de cumpleaños"), { type: "danger" });
            return;
        }

        if (!result || !result.success) {
            this.notification.add(result?.error || _t("No se pudo canjear el regalo"), { type: "warning" });
            return;
        }

        // Load product if not already in the POS store
        let posProduct = this.pos.models["product.product"].get(product.product_id);
        let posProductTmpl = this.pos.models["product.template"].get(product.product_template_id);

        if (!posProduct || !posProductTmpl) {
            try {
                await this.pos.data.read("product.template", [product.product_template_id]);
                await this.pos.data.searchRead(
                    "product.product",
                    [["product_tmpl_id", "=", product.product_template_id]],
                    this.pos.data.fields["product.product"]
                );
                posProduct = this.pos.models["product.product"].get(product.product_id);
                posProductTmpl = this.pos.models["product.template"].get(product.product_template_id);
            } catch {
                // Product could not be loaded
            }
        }

        if (!posProduct || !posProductTmpl) {
            this.notification.add(
                _t("El producto de regalo no está disponible en el POS. Agréguelo a la sesión POS."),
                { type: "danger" }
            );
            return;
        }

        // Add line at price 0
        await this.pos.addLineToCurrentOrder(
            {
                product_id: posProduct,
                product_tmpl_id: posProductTmpl,
                qty: 1,
                price_unit: 0,
            },
            {}
        );

        this.notification.add(
            _t("🎂 Regalo de cumpleaños agregado: ") + product.name,
            { type: "success" }
        );
    },

    /** Override clickRewards to inject the birthday reward into the list. */
    async clickRewards() {
        const order = this.pos.getOrder();
        const partner = order?.getPartner();

        // Build the normal loyalty rewards list
        const loyaltyRewards = this.getPotentialRewards();
        const rewardsList = loyaltyRewards.map((r) => ({
            id: r.reward.id,
            label: r.reward.program_id.name,
            description: `Agregar "${r.reward.description}"`,
            item: { _type: "loyalty", reward: r.reward, coupon_id: r.coupon_id, potentialQty: r.potentialQty },
        }));

        // Prepend birthday reward if the order has a partner
        if (partner) {
            const bday = await this._getBirthdayInfo(partner.id);
            if (bday && bday.is_today) {
                const productName = bday.product?.name || _t("Regalo");
                const available = bday.benefit_available;
                rewardsList.unshift({
                    id: "birthday_reward",
                    label: "🎂 " + _t("Regalo de Cumpleaños") + " — " + productName,
                    description: available
                        ? _t("GRATIS · Solo canjeable en el local")
                        : "⚠️ " + _t("Ya fue canjeado este año"),
                    item: { _type: available ? "birthday" : "birthday_disabled", ...bday },
                });
            }
        }

        if (rewardsList.length === 0) {
            this.notification.add(_t("No hay recompensas disponibles"), { type: "info" });
            return;
        }

        const selected = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Recompensas disponibles"),
            list: rewardsList,
        });

        if (!selected) return;

        if (selected._type === "birthday_disabled") {
            this.notification.add(
                _t("Este beneficio de cumpleaños ya fue canjeado este año"),
                { type: "warning" }
            );
            return;
        }

        if (selected._type === "birthday") {
            await this._applyBirthdayReward(selected);
            return;
        }

        // Normal loyalty reward
        this._applyReward(selected.reward, selected.coupon_id, selected.potentialQty);
    },
});
