import { NextRequest, NextResponse } from 'next/server'
import { readConfig } from '@/lib/config.server'

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const config   = readConfig()
  const segment  = (path || []).join('/')
  const url      = `${config.odoo_url}/api/loyalty/${segment}${req.nextUrl.search}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers['Authorization'] = auth

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined

  try {
    const res  = await fetch(url, { method: req.method, headers, body, cache: 'no-store' })
    const data = await res.text()
    return new NextResponse(data, {
      status:  res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: `Cannot reach Odoo at ${config.odoo_url}` },
      { status: 502 },
    )
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as OPTIONS }
