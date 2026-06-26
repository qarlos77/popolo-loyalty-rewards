'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Mail, KeyRound, RotateCcw } from 'lucide-react'
import { saveSession, getSession } from '@/lib/auth'

type Step = 'email' | 'code'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep]           = useState<Step>('email')
  const [email, setEmail]         = useState('')
  const [code, setCode]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [resendWait, setResendWait] = useState(0)
  const [checking, setChecking]   = useState(true)
  const codeRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (getSession()) router.replace('/dashboard')
    else setChecking(false)
  }, [router])

  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }, [step])

  // Countdown para reenvío
  useEffect(() => {
    if (resendWait <= 0) return
    timerRef.current = setInterval(() => {
      setResendWait(w => {
        if (w <= 1) { clearInterval(timerRef.current!); return 0 }
        return w - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [resendWait])

  async function otpRequest(emailVal: string) {
    const res  = await fetch('/api/otp/request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: emailVal }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al enviar código')
    return data as { ok: boolean; resend_wait?: number }
  }

  async function otpVerify(emailVal: string, codeVal: string) {
    const res  = await fetch('/api/otp/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: emailVal, code: codeVal, device_hint: navigator.userAgent.slice(0, 80) }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Código incorrecto')
    return data as { token: string; expires_at: string; partner: import('@/lib/types').Partner }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await otpRequest(email.trim().toLowerCase())
      setResendWait(res.resend_wait ?? 60)
      setStep('code')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError('')
    setLoading(true)
    try {
      const res = await otpVerify(email.trim().toLowerCase(), code)
      saveSession({ token: res.token, expires_at: res.expires_at, partner: res.partner })
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
      setCode('')
      codeRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendWait > 0) return
    setError('')
    setCode('')
    setLoading(true)
    try {
      const res = await otpRequest(email.trim().toLowerCase())
      setResendWait(res.resend_wait ?? 60)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al reenviar')
    } finally {
      setLoading(false)
    }
  }

  function handleCodeChange(val: string) {
    const clean = val.replace(/\D/g, '').slice(0, 6)
    setCode(clean)
    setError('')
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
        <div className="absolute inset-0"
             style={{
               background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,74,74,0.07) 0%, transparent 70%)'
             }} />
        <div className="relative z-10 max-w-xs text-center space-y-8">
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
          <div className="space-y-3 text-left">
            {[
              { label: 'Puntos acumulados',  value: '1,240 pts', pct: 72 },
              { label: 'Próximo canje',      value: '260 pts restantes', pct: 72 },
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

      {/* Right — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 md:px-12">

        {/* Mobile header */}
        <div className="md:hidden mb-12 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2.5xl neo flex items-center justify-center">
            <div className="w-10 h-10 rounded-xl neo-btn-accent flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
          </div>
          <p className="font-black text-xl tracking-tight" style={{ color: 'var(--fg)' }}>
            PopoloPizza Rewards
          </p>
        </div>

        <div className="w-full max-w-sm">

          {/* ── Paso 1: Email ── */}
          {step === 'email' && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
                  Bienvenido
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
                  Ingresa tu correo para recibir un código de acceso
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                      className="flex-1 bg-transparent border-none outline-none text-base font-medium placeholder:font-normal"
                      style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
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
                             gap-2 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><span>Enviar código</span><ArrowRight size={16} /></>
                  }
                </button>
              </form>

              <p className="text-center text-sm mt-7" style={{ color: 'var(--fg-muted)' }}>
                ¿No tienes cuenta?{' '}
                <a href="/register" className="font-semibold" style={{ color: 'var(--accent)' }}>
                  Crea una
                </a>
              </p>
            </>
          )}

          {/* ── Paso 2: Código OTP ── */}
          {step === 'code' && (
            <>
              <div className="mb-8">
                <button
                  onClick={() => { setStep('email'); setCode(''); setError('') }}
                  className="flex items-center gap-1 text-sm mb-5 -ml-1"
                  style={{ color: 'var(--fg-muted)' }}>
                  <ArrowRight size={14} className="rotate-180" />
                  Cambiar correo
                </button>

                <div className="w-12 h-12 rounded-2xl neo flex items-center justify-center mb-5">
                  <KeyRound size={22} style={{ color: 'var(--accent)' }} />
                </div>

                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
                  Revisa tu correo
                </h2>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                  Enviamos un código de 6 dígitos a{' '}
                  <strong style={{ color: 'var(--fg)' }}>{email}</strong>
                </p>
              </div>

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-3"
                         style={{ color: 'var(--fg-muted)' }}>
                    Código de verificación
                  </label>
                  <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                    <KeyRound size={17} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                    <input
                      ref={codeRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      value={code}
                      onChange={e => handleCodeChange(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      autoComplete="one-time-code"
                      className="flex-1 bg-transparent border-none outline-none text-2xl font-black
                                 tracking-[0.3em] placeholder:text-base placeholder:font-normal
                                 placeholder:tracking-normal"
                      style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                      required
                    />
                    {code.length > 0 && (
                      <span className="text-xs font-semibold tabular-nums"
                            style={{ color: code.length === 6 ? 'var(--accent)' : 'var(--fg-subtle)' }}>
                        {code.length}/6
                      </span>
                    )}
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
                  disabled={loading || code.length !== 6}
                  className="w-full neo-btn-accent rounded-2xl py-4 flex items-center justify-center
                             gap-2 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><span>Verificar</span><ArrowRight size={16} /></>
                  }
                </button>

                {/* Reenviar */}
                <div className="text-center pt-1">
                  {resendWait > 0 ? (
                    <span className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                      Reenviar en <strong style={{ color: 'var(--fg-muted)' }}>{resendWait}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="text-sm font-semibold flex items-center gap-1.5 mx-auto
                                 disabled:opacity-40"
                      style={{ color: 'var(--accent)' }}>
                      <RotateCcw size={13} />
                      Reenviar código
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          <p className="text-center text-xs mt-8" style={{ color: 'var(--fg-subtle)' }}>
            © {new Date().getFullYear()} PopoloPizza
          </p>
        </div>
      </div>
    </div>
  )
}
