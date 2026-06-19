import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: { accent: '#ff4a4a' },
        neo: {
          bg:      'var(--bg)',
          deep:    'var(--bg-deep)',
          fg:      'var(--fg)',
          muted:   'var(--fg-muted)',
          subtle:  'var(--fg-subtle)',
          border:  'var(--border)',
          'accent-dim': 'var(--accent-dim)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bounce-in': 'bounceIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in':   'fadeIn 0.25s ease-out',
      },
      keyframes: {
        bounceIn: {
          '0%':   { transform: 'scale(0.94) translateY(8px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      borderRadius: {
        '2.5xl': '20px',
        '3xl':   '24px',
        '4xl':   '32px',
      },
    },
  },
  plugins: [],
}

export default config
