import fs   from 'fs'
import path from 'path'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

const OTP_PATH   = path.join(process.cwd(), 'data', 'otps.json')
const OTP_TTL_MS = 10 * 60 * 1000   // 10 minutos
const RESEND_MS  = 60 * 1000        // 60 segundos entre reenvíos

interface OtpEntry {
  code:    string
  expires: number   // ms epoch
  sent_at: number   // ms epoch
}

// ── Almacenamiento en disco ───────────────────────────────────────────────────
function readStore(): Record<string, OtpEntry> {
  try {
    if (fs.existsSync(OTP_PATH)) return JSON.parse(fs.readFileSync(OTP_PATH, 'utf-8'))
  } catch {}
  return {}
}

function writeStore(store: Record<string, OtpEntry>) {
  const dir = path.dirname(OTP_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // Limpiar entradas expiradas antes de guardar
  const now = Date.now()
  const clean: Record<string, OtpEntry> = {}
  for (const [k, v] of Object.entries(store)) {
    if (v.expires > now) clean[k] = v
  }
  fs.writeFileSync(OTP_PATH, JSON.stringify(clean))
}

// ── Mailer ────────────────────────────────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'email-smtp.us-west-2.amazonaws.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

// ── API pública ───────────────────────────────────────────────────────────────
export type OtpRequestResult =
  | { ok: true; resend_wait?: number }
  | { error: string }

export async function requestOtp(email: string, name = ''): Promise<OtpRequestResult> {
  const store   = readStore()
  const now     = Date.now()
  const existing = store[email]

  // Rate limit
  if (existing && now - existing.sent_at < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now - existing.sent_at)) / 1000)
    return { ok: true, resend_wait: wait }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  store[email] = { code, expires: now + OTP_TTL_MS, sent_at: now }
  writeStore(store)

  const first = (name || email).split(/[\s@]/)[0]
  const from  = process.env.SMTP_FROM || 'Popolo Rewards <noreply@popolopizza.com>'

  try {
    const transport = createTransport()
    await transport.sendMail({
      from,
      to:      email,
      subject: `${code} — tu código de acceso Popolo Rewards`,
      html: `
<div style="font-family:-apple-system,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#ffffff">
  <p style="color:#ff4a4a;font-weight:900;font-size:18px;margin:0 0 24px 0">Popolo Rewards</p>
  <p style="color:#222;margin:0 0 8px 0">Hola ${first},</p>
  <p style="color:#444;margin:0 0 24px 0">Tu código de acceso es:</p>
  <div style="background:#f5f5f7;border-radius:14px;padding:28px;text-align:center;margin:0 0 24px 0">
    <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#ff4a4a;font-family:monospace">${code}</span>
  </div>
  <p style="color:#666;font-size:13px;margin:0 0 6px 0">⏱ Válido por 10 minutos.</p>
  <p style="color:#aaa;font-size:12px;margin:0">Si no solicitaste este código, ignora este mensaje.</p>
</div>`,
      text: `Tu código de acceso Popolo Rewards es: ${code}\n\nVálido por 10 minutos.`,
    })
    return { ok: true }
  } catch (err) {
    console.error('[OTP] email send error:', err)
    return { error: 'No se pudo enviar el correo. Intenta de nuevo.' }
  }
}

export type OtpVerifyResult =
  | { ok: true }
  | { error: string }

export function verifyOtp(email: string, code: string): OtpVerifyResult {
  const store   = readStore()
  const entry   = store[email]
  if (!entry)                          return { error: 'Código inválido o expirado' }
  if (Date.now() > entry.expires)      { delete store[email]; writeStore(store); return { error: 'El código expiró. Solicita uno nuevo.' } }
  if (entry.code !== code.trim())      return { error: 'Código incorrecto' }

  delete store[email]   // uso único
  writeStore(store)
  return { ok: true }
}
