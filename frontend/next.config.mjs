/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: process.env.NEXT_PUBLIC_ODOO_HOST || 'sistema.popolopizza.com' },
    ],
  },
}

export default nextConfig
