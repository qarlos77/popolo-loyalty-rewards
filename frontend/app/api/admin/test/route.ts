import { NextRequest, NextResponse } from 'next/server'
import { readConfig, getAdminPassword } from '@/lib/config.server'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-password') !== getAdminPassword()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { odoo_url } = readConfig()

  try {
    const start = Date.now()
    const res   = await fetch(`${odoo_url}/web/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    const ms    = Date.now() - start
    const body  = await res.json().catch(() => ({}))

    return NextResponse.json({
      ok:      res.status === 200,
      status:  res.status,
      latency: ms,
      odoo_url,
      detail:  body,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      ok:       false,
      odoo_url,
      error:    err instanceof Error ? err.message : 'Connection failed',
    }, { status: 502 })
  }
}
