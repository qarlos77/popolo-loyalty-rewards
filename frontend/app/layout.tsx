import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PopoloPizza Rewards',
  description: 'Tu programa de lealtad PopoloPizza',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Rewards' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1a2e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-brand-dark min-h-screen">
        {/* Mobile-width wrapper — looks like an app on desktop too */}
        <div className="mx-auto max-w-[430px] min-h-screen relative overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  )
}
