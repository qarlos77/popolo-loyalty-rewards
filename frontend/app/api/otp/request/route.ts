import { NextRequest, NextResponse } from 'next/server'
import { requestOtp } from '@/lib/otp.server'

// Buscar partner en Odoo para confirmar que el email está registrado
async function lookupPartner(email: string): Promise<{ found: boolean; name?: string }> {
  try {
    const odooUrl = process.env.ODOO_BASE_URL || 'https://sistema.popolopizza.com'
    const apiKey  = process.env.SYNC_API_KEY || ''
    const res = await fetch(
      `${odooUrl}/api/loyalty/points-by-email?email=${encodeURIComponent(email)}`,
      { headers: { 'X-API-Key': apiKey }, cache: 'no-store' },
    )
    const data = await res.json()
    return { found: !!data.found, name: data.name }
  } catch {
    return { found: false }
  }
}

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

  const partner = await lookupPartner(email.trim().toLowerCase())
  if (!partner.found) {
    return NextResponse.json(
      { error: 'No encontramos una cuenta con ese correo' },
      { status: 404 },
    )
  }

  const result = await requestOtp(email.trim().toLowerCase(), partner.name)
  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
