import type { Metadata, Viewport } from 'next'
import './globals.css'

const appName = process.env.APP_NAME || 'Rewards'

export const metadata: Metadata = {
  title: appName,
  description: `Tu programa de lealtad ${appName}`,
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: appName },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eaedf3' },
    { media: '(prefers-color-scheme: dark)',  color: '#1a1c24' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-screen antialiased" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        {children}
      </body>
    </html>
  )
}
