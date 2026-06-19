'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Mail } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { saveSession, getSession } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (getSession()) router.replace('/dashboard')
    else setChecking(false)
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await odoo.auth(email.trim().toLowerCase(), navigator.userAgent.slice(0, 80))
      saveSession({ token: res.token, expires_at: res.expires_at, partner: res.partner })
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full neo-inset flex items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* Left — branding panel (desktop) */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 flex-col items-center justify-center p-16
                      relative overflow-hidden"
           style={{ background: 'var(--bg-deep)' }}>
        {/* Subtle radial glow */}
        <div className="absolute inset-0"
             style={{
               background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,74,74,0.07) 0%, transparent 70%)'
             }} />

        <div className="relative z-10 max-w-xs text-center space-y-8">
          {/* Logo mark */}
          <div className="mx-auto w-20 h-20 rounded-3xl neo flex items-center justify-center">
            <div className="w-12 h-12 rounded-2xl neo-btn-accent flex items-center justify-center">
              <span className="text-white font-black text-xl">P</span>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>
              PopoloPizza
            </h1>
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--accent)' }}>
              Rewards
            </p>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
            Acumula puntos con cada compra y canjéalos por descuentos y productos gratis.
          </p>

          {/* Decorative cards */}
          <div className="space-y-3 text-left">
            {[
              { label: 'Puntos acumulados', value: '1,240 pts', pct: 72 },
              { label: 'Próximo canje',     value: '260 pts restantes', pct: 72 },
            ].map(item => (
              <div key={item.label} className="neo-sm rounded-2xl p-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                    {item.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                    {item.value}
                  </span>
                </div>
                <div className="h-1.5 rounded-full neo-inset-sm overflow-hidden">
                  <div className="progress-fill h-full" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 md:px-12">

        {/* Mobile header */}
        <div className="md:hidden mb-12 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2.5xl neo flex items-center justify-center">
            <div className="w-10 h-10 rounded-xl neo-btn-accent flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
          </div>
          <div className="text-center">
            <p className="font-black text-xl tracking-tight" style={{ color: 'var(--fg)' }}>
              PopoloPizza Rewards
            </p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
              Bienvenido
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
              Ingresa tu correo para ver tus puntos
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-3"
                     style={{ color: 'var(--fg-muted)' }}>
                Correo electrónico
              </label>
              <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                <Mail size={17} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="flex-1 bg-transparent border-none outline-none text-base font-medium
                             placeholder:font-normal"
                  style={{
                    color: 'var(--fg)',
                    caretColor: 'var(--accent)',
                  }}
                  inputMode="email"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="neo-inset-sm rounded-xl px-4 py-3 text-sm font-medium"
                   style={{ color: 'var(--accent)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full neo-btn-accent rounded-2xl py-4 flex items-center justify-center
                         gap-2 text-white font-bold text-sm disabled:opacity-40
                         disabled:cursor-not-allowed">
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <><span>Ingresar</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p className="text-center text-xs mt-10" style={{ color: 'var(--fg-subtle)' }}>
            © {new Date().getFullYear()} PopoloPizza
          </p>
        </div>
      </div>
    </div>
  )
}
