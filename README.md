# Loyalty Rewards

App de lealtad para restaurantes. Integra Odoo 19, WooCommerce y WhatsApp.

## Arquitectura

```
rewards.tudominio.com   →  Next.js 14 (Docker)
                               ↕ proxy
sistema.tudominio.com   →  Odoo 19  (addon: loyalty_rewards_api)
                               ↕ REST API
www.tudominio.com       →  WordPress + WooCommerce + Plugin
```

## Instalación rápida

### 1. Clonar y configurar

```bash
git clone https://github.com/tu-usuario/loyalty-rewards.git
cd loyalty-rewards
cp .env.example .env
nano .env   # edita los valores de tu instancia
```

### 2. Variables del `.env`

| Variable | Descripción | Ejemplo |
|---|---|---|
| `APP_NAME` | Nombre del app | `MiPizza Rewards` |
| `REWARDS_DOMAIN` | Dominio del frontend | `rewards.mipizza.com` |
| `ODOO_BASE_URL` | URL de Odoo | `https://odoo.mipizza.com` |
| `ODOO_DB` | Base de datos de Odoo | `MiPizzaLoyalty` |
| `DB_HOST` | Host PostgreSQL | `localhost` |
| `DB_USER` | Usuario PostgreSQL | `odoo` |
| `DB_PASS` | Contraseña PostgreSQL | `...` |
| `WC_URL` | URL de WooCommerce | `https://www.mipizza.com` |
| `WC_CONSUMER_KEY` | WC API Key | `ck_...` |
| `WC_CONSUMER_SECRET` | WC API Secret | `cs_...` |
| `SYNC_API_KEY` | Clave compartida Odoo↔WP | `openssl rand -hex 20` |
| `ADMIN_PASSWORD` | Panel /admin del frontend | `...` |
| `WELCOME_POINTS` | Puntos al registrarse | `10` |
| `POINTS_RATIO` | Puntos por sol gastado | `0.1` |
| `BIRTHDAY_POINTS` | Puntos extra en cumpleaños | `50` |
| `WA_PHONE_ID` | WhatsApp Phone ID (opcional) | `123456789` |
| `WA_TOKEN` | WhatsApp Bearer Token (opcional) | `...` |

### 3. Ejecutar el setup

```bash
# Configura todo de una vez
./setup.sh --all

# O paso a paso:
./setup.sh --configure-odoo   # escribe parámetros en Odoo
./setup.sh --ssl               # obtiene certificado SSL
./setup.sh --deploy            # construye y levanta Docker
```

### 4. Instalar el addon de Odoo

```bash
# En tu servidor Odoo:
cp -r odoo-addon/loyalty_rewards_api /opt/odoo/custom-addons/
sudo systemctl restart odoo
# Activar módulo en Odoo: Ajustes → Apps → Buscar "loyalty_rewards_api"
```

### 5. Instalar el plugin de WordPress

```bash
zip -r popolo-loyalty-sync.zip wordpress-plugin/
```

1. WP Admin → Plugins → Añadir nuevo → Subir plugin → `popolo-loyalty-sync.zip`
2. Activar el plugin
3. WooCommerce → Loyalty Sync → configurar:
   - **URL de Odoo**: valor de `ODOO_BASE_URL`
   - **Clave API**: valor de `SYNC_API_KEY`

### 6. Configurar credenciales WooCommerce en WP

WooCommerce → Ajustes → Avanzado → REST API → Añadir clave  
Permisos: **Lectura/Escritura** → copiar Consumer Key y Secret al `.env`

---

## Estructura del proyecto

```
loyalty-rewards/
├── .env.example          # Plantilla de configuración
├── .env                  # Tu configuración (no se sube a git)
├── setup.sh              # Script de instalación
├── docker-compose.yml    # Orquestación Docker
│
├── frontend/             # App Next.js 14
│   ├── app/
│   │   ├── page.tsx         # Login
│   │   ├── register/        # Auto-registro
│   │   ├── dashboard/       # Dashboard del cliente
│   │   ├── rewards/         # Premios y cupones
│   │   ├── history/         # Historial de puntos
│   │   └── api/loyalty/     # Proxy hacia Odoo
│   ├── components/
│   └── lib/
│
├── nginx/
│   ├── nginx.conf.template  # Plantilla (usa ${REWARDS_DOMAIN})
│   └── nginx.conf           # Generado por setup.sh
│
├── odoo-addon/
│   └── loyalty_rewards_api/ # Módulo Odoo 19
│       ├── controllers/main.py  # Todos los endpoints REST
│       ├── models/              # loyalty_card, tokens, logs
│       └── views/               # Vistas de configuración
│
└── wordpress-plugin/
    └── popolo-loyalty-sync/ # Plugin WooCommerce
        ├── popolo-loyalty-sync.php
        ├── includes/            # Order sync, checkout, registro
        └── admin/               # Panel de configuración WP
```

## Endpoints de la API (Odoo)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/loyalty/self-register` | Pública | Registro desde rewards app |
| POST | `/api/loyalty/auth` | Pública | Login por email |
| GET  | `/api/loyalty/me` | Bearer | Perfil del usuario |
| GET  | `/api/loyalty/balance` | Bearer | Puntos actuales |
| GET  | `/api/loyalty/rewards` | Bearer | Premios disponibles |
| GET  | `/api/loyalty/coupons` | Bearer | Cupones del usuario |
| GET  | `/api/loyalty/history` | Bearer | Historial de puntos |
| POST | `/api/loyalty/redeem` | Bearer | Canjear premio |
| POST | `/api/loyalty/sync-order` | X-API-Key | Sync desde WooCommerce |
| POST | `/api/loyalty/register` | X-API-Key | Registro desde WooCommerce |
| GET/POST | `/api/loyalty/points-by-email` | X-API-Key | Consulta de puntos (checkout) |
| POST | `/api/loyalty/birthday-status` | X-API-Key | Estado de beneficio cumpleaños |
| POST | `/api/loyalty/birthday-redeem` | X-API-Key | Canjear beneficio cumpleaños |

## Qué se crea al registrarse un cliente

1. `res.partner` en Odoo
2. `loyalty.card` (programa de puntos) en Odoo
3. `loyalty.card` (cupón promo_code "Primer Pedido") en Odoo
4. Cliente en WooCommerce (`POST /wc/v3/customers`)
5. Cupón en WooCommerce (`POST /wc/v3/coupons`) con restricción de email

## Variables de Odoo (ir.config_parameter)

Configuradas automáticamente por `setup.sh --configure-odoo`:

| Clave | Descripción |
|---|---|
| `loyalty_rewards_api.sync_api_key` | Clave compartida con WP |
| `loyalty_rewards_api.wc_url` | URL de WooCommerce |
| `loyalty_rewards_api.wc_consumer_key` | WC Consumer Key |
| `loyalty_rewards_api.wc_consumer_secret` | WC Consumer Secret |
| `loyalty_rewards_api.points_ratio` | Puntos por unidad monetaria |
| `loyalty_rewards_api.welcome_points` | Puntos de bienvenida |
| `loyalty_rewards_api.birthday_points` | Puntos de cumpleaños |
| `loyalty_rewards_api.birthday_window_days` | Días de ventana cumpleaños |
| `loyalty_rewards_api.wa_phone_id` | WhatsApp Phone ID |
| `loyalty_rewards_api.wa_token` | WhatsApp Bearer Token |
