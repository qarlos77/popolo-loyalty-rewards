#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  Loyalty Rewards — Script de instalación
#  Uso: ./setup.sh [--configure-odoo] [--ssl] [--deploy]
#
#  --configure-odoo   Escribe los parámetros en la base de datos de Odoo
#  --ssl              Solicita certificado SSL con Certbot
#  --deploy           Construye y levanta los contenedores Docker
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Colores ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}══ $* ══${NC}"; }

# ─── Leer .env ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
    error ".env no encontrado. Copia .env.example a .env y rellena los valores."
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# ─── Validar variables obligatorias ───────────────────────────────
REQUIRED=(REWARDS_DOMAIN ODOO_BASE_URL NEXT_PUBLIC_ODOO_HOST SYNC_API_KEY)
for var in "${REQUIRED[@]}"; do
    [[ -z "${!var:-}" ]] && error "Variable obligatoria no definida: $var"
done

# ─── Flags ────────────────────────────────────────────────────────
DO_ODOO=false; DO_SSL=false; DO_DEPLOY=false
for arg in "$@"; do
    case $arg in
        --configure-odoo) DO_ODOO=true  ;;
        --ssl)            DO_SSL=true   ;;
        --deploy)         DO_DEPLOY=true ;;
        --all)            DO_ODOO=true; DO_SSL=true; DO_DEPLOY=true ;;
        *) warn "Argumento desconocido: $arg" ;;
    esac
done

if ! $DO_ODOO && ! $DO_SSL && ! $DO_DEPLOY; then
    DO_ODOO=true; DO_SSL=false; DO_DEPLOY=true
fi

# ══════════════════════════════════════════════════════════════════
section "Configuración detectada"
# ══════════════════════════════════════════════════════════════════
echo "  App:         ${APP_NAME:-Rewards}"
echo "  Dominio:     $REWARDS_DOMAIN"
echo "  Odoo:        $ODOO_BASE_URL"
echo "  WooCommerce: ${WC_URL:-no configurado}"
echo ""

# ══════════════════════════════════════════════════════════════════
if $DO_ODOO; then
section "1. Configurando parámetros en Odoo"
# ══════════════════════════════════════════════════════════════════

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-odoo}"
DB_PASS="${DB_PASS:-odoo2024secure}"
DB_NAME="${ODOO_DB:-PopoloLoyalty}"

command -v psql >/dev/null 2>&1 || error "psql no encontrado. Instala postgresql-client."

psql_exec() {
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "$1" -q 2>&1
}

upsert_param() {
    local key="$1" val="$2"
    psql_exec "
        INSERT INTO ir_config_parameter (key, value, create_date, write_date)
        VALUES ('$key', '$val', NOW(), NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, write_date = NOW();
    " && info "  $key = $val"
}

info "Conectando a $DB_NAME en $DB_HOST..."
psql_exec "SELECT 1" >/dev/null || error "No se pudo conectar a la base de datos. Verifica DB_HOST, DB_USER, DB_PASS, ODOO_DB en .env"

upsert_param "loyalty_rewards_api.sync_api_key"       "${SYNC_API_KEY}"
upsert_param "loyalty_rewards_api.wc_url"             "${WC_URL:-}"
upsert_param "loyalty_rewards_api.wc_consumer_key"    "${WC_CONSUMER_KEY:-}"
upsert_param "loyalty_rewards_api.wc_consumer_secret" "${WC_CONSUMER_SECRET:-}"
upsert_param "loyalty_rewards_api.points_ratio"       "${POINTS_RATIO:-0.1}"
upsert_param "loyalty_rewards_api.welcome_points"     "${WELCOME_POINTS:-0}"
upsert_param "loyalty_rewards_api.birthday_points"    "${BIRTHDAY_POINTS:-0}"
upsert_param "loyalty_rewards_api.birthday_window_days" "${BIRTHDAY_WINDOW_DAYS:-30}"

if [[ -n "${WA_PHONE_ID:-}" ]]; then
    upsert_param "loyalty_rewards_api.wa_phone_id"           "$WA_PHONE_ID"
    upsert_param "loyalty_rewards_api.wa_token"              "$WA_TOKEN"
    upsert_param "loyalty_rewards_api.wa_template_earned"    "${WA_TEMPLATE_EARNED:-loyalty_earned}"
    upsert_param "loyalty_rewards_api.wa_template_redeemed"  "${WA_TEMPLATE_REDEEMED:-loyalty_redeemed}"
fi

success "Parámetros de Odoo configurados"
fi

# ══════════════════════════════════════════════════════════════════
section "2. Generando configuración de Nginx"
# ══════════════════════════════════════════════════════════════════

TEMPLATE="$SCRIPT_DIR/nginx/nginx.conf.template"
OUTPUT="$SCRIPT_DIR/nginx/nginx.conf"

if [[ ! -f "$TEMPLATE" ]]; then
    error "Template de nginx no encontrado: $TEMPLATE"
fi

sed "s/\${REWARDS_DOMAIN}/$REWARDS_DOMAIN/g" "$TEMPLATE" > "$OUTPUT"
success "nginx/nginx.conf generado para $REWARDS_DOMAIN"

# Copiar a nginx del sistema si existe
if [[ -d "/etc/nginx/sites-available" ]]; then
    sudo cp "$OUTPUT" "/etc/nginx/sites-available/rewards"
    sudo ln -sf "/etc/nginx/sites-available/rewards" "/etc/nginx/sites-enabled/rewards" 2>/dev/null || true
    sudo nginx -t && sudo systemctl reload nginx
    success "Nginx del sistema actualizado"
fi

# ══════════════════════════════════════════════════════════════════
if $DO_SSL; then
section "3. Solicitando certificado SSL"
# ══════════════════════════════════════════════════════════════════

ADMIN_EMAIL="${CERTBOT_EMAIL:-${ADMIN_EMAIL:-admin@$(echo "$REWARDS_DOMAIN" | cut -d'.' -f2-)}}"
command -v certbot >/dev/null 2>&1 || error "certbot no encontrado. Instala con: sudo apt install certbot python3-certbot-nginx"

info "Solicitando certificado para $REWARDS_DOMAIN..."
sudo certbot certonly --webroot \
    -w /var/www/html \
    --email "$ADMIN_EMAIL" \
    --agree-tos --no-eff-email \
    -d "$REWARDS_DOMAIN" \
    --non-interactive

# Reemplazar config temporal por la final con SSL
sudo cp "$OUTPUT" "/etc/nginx/sites-available/rewards"
sudo nginx -t && sudo systemctl reload nginx
success "SSL configurado para $REWARDS_DOMAIN"
fi

# ══════════════════════════════════════════════════════════════════
if $DO_DEPLOY; then
section "4. Construyendo y desplegando contenedores"
# ══════════════════════════════════════════════════════════════════

cd "$SCRIPT_DIR"
command -v docker >/dev/null 2>&1 || error "Docker no encontrado."

info "Construyendo imagen del frontend..."
sudo docker compose build frontend

info "Iniciando contenedores..."
sudo docker compose up -d

info "Verificando estado..."
sleep 5
sudo docker compose ps

HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/ 2>/dev/null || echo "000")
if [[ "$HTTP" == "200" ]]; then
    success "Frontend respondiendo en localhost:3010"
else
    warn "Frontend respondió con HTTP $HTTP (puede tardar unos segundos más)"
fi
fi

# ══════════════════════════════════════════════════════════════════
section "Instalación completa"
# ══════════════════════════════════════════════════════════════════

echo ""
echo -e "${GREEN}${BOLD}Próximos pasos:${NC}"
echo ""
echo "  1. Instalar el plugin de WordPress:"
echo "     → Comprime: zip -r popolo-loyalty-sync.zip wordpress-plugin/"
echo "     → Sube en WP Admin → Plugins → Añadir nuevo → Subir plugin"
echo "     → Actívalo y ve a WooCommerce → Loyalty Sync"
echo "     → URL de Odoo: $ODOO_BASE_URL"
echo "     → Clave API:   $SYNC_API_KEY"
echo ""
echo "  2. Configurar addon de Odoo:"
echo "     → Copia odoo-addon/loyalty_rewards_api/ a tu directorio de addons"
echo "     → Activa el módulo 'loyalty_rewards_api' en Odoo"
echo ""
echo "  3. URL del rewards app: https://$REWARDS_DOMAIN"
echo ""
