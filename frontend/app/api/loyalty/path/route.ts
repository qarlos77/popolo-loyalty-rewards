import { NextRequest, NextResponse } from 'next/server'

const ODOO = process.env.ODOO_BASE_URL || 'https://sistema.popolopizza.com'

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (params.path || []).join('/')
  const url = `${ODOO}/api/loyalty/${path}${req.nextUrl.search}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers['Authorization'] = auth

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  })

  const data = await res.text()
  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as OPTIONS }
