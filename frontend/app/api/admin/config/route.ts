import { NextRequest, NextResponse } from 'next/server'
import { readConfig, writeConfig, getAdminPassword } from '@/lib/config.server'

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === getAdminPassword()
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(readConfig())
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.odoo_url || typeof body.odoo_url !== 'string') {
    return NextResponse.json({ error: 'odoo_url required' }, { status: 400 })
  }
  const updated = writeConfig({ odoo_url: body.odoo_url.replace(/\/$/, '') })
  return NextResponse.json(updated)
}
