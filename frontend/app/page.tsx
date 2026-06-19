'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pizza, Smartphone, ArrowRight, Loader2 } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { saveSession, getSession } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
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
      const res = await odoo.auth(identifier.trim(), navigator.userAgent.slice(0, 80))
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
      <Loader2 className="animate-spin text-brand-orange" size={32} />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-brand-dark">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        {/* Logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-brand-orange/20 blur-2xl scale-150" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-brand-red to-brand-orange
                          flex items-center justify-center shadow-2xl">
            <Pizza size={44} className="text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-white tracking-tight mb-1">PopoloPizza</h1>
        <p className="text-brand-orange font-semibold text-lg mb-2">Rewards</p>
        <p className="text-gray-400 text-sm text-center mb-10">
          Acumula puntos con cada pizza<br/>y canjéalos por increíbles premios
        </p>

        {/* Card preview graphic */}
        <div className="w-full max-w-sm mb-10 relative h-40">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-red via-brand-orange to-yellow-400
                          shadow-2xl opacity-90 rotate-3" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-card to-brand-muted
                          border border-white/10 -rotate-1 shadow-xl flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Tus puntos</p>
              <p className="text-5xl font-black text-white points-glow">🍕</p>
            </div>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2 ml-1">DNI o número de teléfono</label>
            <div className="relative">
              <Smartphone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="Ej: 45612345 ó 987654321"
                className="w-full bg-brand-card border border-white/10 rounded-2xl py-4 pl-11 pr-4
                           text-white placeholder-gray-500 focus:outline-none focus:border-brand-orange
                           focus:ring-1 focus:ring-brand-orange transition text-base"
                inputMode="numeric"
                autoComplete="off"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !identifier.trim()}
            className="w-full bg-gradient-to-r from-brand-red to-brand-orange
                       text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all
                       shadow-lg shadow-brand-orange/30 text-base"
          >
            {loading
              ? <Loader2 size={20} className="animate-spin" />
              : <>Ingresar <ArrowRight size={20} /></>
            }
          </button>
        </form>
      </div>

      <p className="text-center text-gray-600 text-xs pb-8">
        © 2025 PopoloPizza · Programa de Lealtad
      </p>
    </div>
  )
}
