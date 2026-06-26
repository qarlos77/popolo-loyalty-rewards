import { NextRequest, NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/otp.server'
import { readConfig } from '@/lib/config.server'

export async function POST(req: NextRequest) {
  const { email, code, device_hint } = await req.json().catch(() => ({}))
  if (!email || !code) {
    return NextResponse.json({ error: 'email y código requeridos' }, { status: 400 })
  }

  const result = verifyOtp(email.trim().toLowerCase(), code)
  if ('error' in result) return NextResponse.json(result, { status: 400 })

  // OTP válido — pedir token a Odoo
  const config = readConfig()
  try {
    const res = await fetch(`${config.odoo_url}/api/loyalty/auth`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier: email.trim().toLowerCase(), device_hint }),
      cache:   'no-store',
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error al conectar con Odoo' }, { status: 502 })
  }
}
