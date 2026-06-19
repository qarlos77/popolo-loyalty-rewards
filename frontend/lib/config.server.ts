import fs   from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json')

export interface AppConfig {
  odoo_url: string
}

function defaults(): AppConfig {
  return {
    odoo_url: process.env.ODOO_BASE_URL || 'https://sistema.popolopizza.com',
  }
}

export function readConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults(), ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
    }
  } catch {}
  return defaults()
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const next = { ...readConfig(), ...patch }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin'
}
