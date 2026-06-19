import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: process.env.NEXT_PUBLIC_ODOO_HOST || 'sistema.popolopizza.com' },
    ],
  },
}

export default nextConfig
