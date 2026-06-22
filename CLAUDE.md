# Popolo Loyalty — Contexto del proyecto

## Reglas de trabajo
- **NO ejecutes nada hasta que el usuario diga "plomo"** — siempre mostrá los cambios propuestos primero.
- Todos los cambios: desplegar en Odoo/WP, testear vos mismo, esperar confirmación del usuario, luego push a git.
- **No pushees a git hasta que el usuario lo verifique y lo autorice.**

## Infraestructura

| Recurso | Valor |
|---|---|
| Servidor WP | `ubuntu@54.149.27.19` |
| Clave SSH | `~/.ssh/popolopizza` |
| Plugin WP | `/var/www/html/popolopizza.com/wp-content/plugins/popolo-loyalty-sync/` |
| Base de datos Odoo | `PopoloLoyalty` |
| Módulo Odoo | `loyalty_rewards_api` |
| My Account | `https://popolopizza.com/my-account/` (page ID 13) |
| Checkout | `https://popolopizza.com/checkout/` (page ID 12) |

## Plugin WordPress — `popolo-loyalty-sync`

- **Versión actual:** `1.3.5`
- **Archivos clave (locales):**
  - `wordpress-plugin/popolo-loyalty-sync.php` — entrada del plugin, define `POPOLO_LOYALTY_VERSION`
  - `wordpress-plugin/includes/class-checkout.php` — campos adicionales de checkout, registro My Account, scripts
  - `wordpress-plugin/includes/birthday-picker.js` — máscara DD/MM/AAAA para el campo fecha de nacimiento
  - `wordpress-plugin/includes/class-api-client.php` — cliente HTTP hacia Odoo
  - `wordpress-plugin/includes/class-order-sync.php` — sincronización de pedidos completados

## Campos adicionales de checkout (WC Blocks)

Registrados en `class-checkout.php::register_block_fields()` en la ubicación `contact`:

| ID | Tipo | Label |
|---|---|---|
| `popolo-loyalty/doc-type` | select | Tipo de documento (DNI / C.E. / Pasaporte) |
| `popolo-loyalty/doc-number` | text | Número de documento |
| `popolo-loyalty/birth-date` | text | Fecha de nacimiento |

El campo `birth-date` tiene `attributes => ['autocomplete' => 'bday', 'data-popolo-birth' => '1']`.  
El atributo `data-popolo-birth` pasa el filtro de WC Blocks (`strpos($key, 'data-') === 0`) y llega al DOM.

## Máscara de fecha (`birthday-picker.js`)

- Selector primario: `[data-popolo-birth]` (block checkout)
- Selector secundario: `#reg_birth_date` (formulario My Account)
- Usa `nativeSetter + dispatchEvent('input')` para actualizar inputs React-controlled
- `busy` flag evita bucle infinito al re-disparar el evento
- `MutationObserver` + `setInterval` (500ms, 30 ticks) para inicializar cuando React termina de renderizar
- **No poner `placeholder` en el campo del block checkout** — WC Blocks ya tiene floating label "Fecha de nacimiento" que se superpone

## CSS aplicado (en `birthday-picker.js`)

```css
#reg_birth_date::placeholder, [data-popolo-birth]::placeholder { color: #b0b0b0; }
.wc-blocks-components-select .wc-blocks-components-select__label { color: #767676; }
```

El segundo rule iguala el color del label "Tipo de documento" con el gris claro de los demás campos.

## Formato de fecha

- Input del usuario: `DD/MM/AAAA`
- Almacenado en WP order meta: `YYYY-MM-DD` (convertido por `normalize_date()`)
- Almacenado en Odoo: campo `x_birth_date` en `res.partner`

## Módulo Odoo — `loyalty_rewards_api`

- Ruta: `odoo-addon/loyalty_rewards_api/`
- Controlador: `controllers/main.py`
- Endpoint principal recibe pedidos de WC y acumula puntos al partner

## Tareas pendientes (esperando "plomo")

1. **Mensaje en página de carrito:** "Con esta compra acumularías XX puntos ¡más bonos de bienvenida! Regístrate en Popolo Rewards en la siguiente pantalla"
2. **Texto del bloque checkout "crear cuenta":** cambiar a "Regístrate y únete a Popolo Rewards para ganar cupones y beneficios"

## Cómo deployar cambios al servidor WP

```bash
scp -i ~/.ssh/popolopizza archivo.php ubuntu@54.149.27.19:/tmp/
ssh -i ~/.ssh/popolopizza ubuntu@54.149.27.19 "
  sudo cp /tmp/archivo.php /var/www/html/popolopizza.com/wp-content/plugins/popolo-loyalty-sync/includes/archivo.php
  sudo chown www-data:www-data ...
"
```

Siempre bumpeá `POPOLO_LOYALTY_VERSION` en `popolo-loyalty-sync.php` para invalidar caché del browser.
