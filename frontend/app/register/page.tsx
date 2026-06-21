'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, User, Mail, Phone, Calendar, ArrowLeft, CheckCircle, CreditCard } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { saveSession, getSession } from '@/lib/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')

  const [form, setForm] = useState({
    name:       '',
    last_name:  '',
    email:      '',
    phone:      '',
    birth_date: '',
    doc_type:   'DNI',
    doc_number: '',
  })

  useEffect(() => {
    if (getSession()) router.replace('/dashboard')
    else setChecking(false)
  }, [router])

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const DOC_TYPES = [
    { value: 'DNI',      label: 'DNI',       placeholder: '12345678',    maxLen: 8  },
    { value: 'CE',       label: 'C.E.',       placeholder: 'A1234567',    maxLen: 12 },
    { value: 'Pasaporte', label: 'Pasaporte', placeholder: 'AB123456',    maxLen: 20 },
  ]
  const currentDocType = DOC_TYPES.find(d => d.value === form.doc_type) ?? DOC_TYPES[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: Parameters<typeof odoo.selfRegister>[0] = {
        name:       form.name.trim(),
        last_name:  form.last_name.trim(),
        email:      form.email.trim().toLowerCase(),
        doc_type:   form.doc_type,
        doc_number: form.doc_number.trim(),
      }
      if (form.phone.trim())      payload.phone      = form.phone.trim()
      if (form.birth_date.trim()) payload.birth_date = form.birth_date.trim()

      const res = await odoo.selfRegister(payload)
      saveSession({ token: res.token, expires_at: res.expires_at, partner: res.partner })
      setSuccess(true)
      setTimeout(() => router.replace('/dashboard'), 1800)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de conexión'
      if (msg.toLowerCase().includes('ya está registrado')) {
        setError('Este correo ya tiene una cuenta. ¿Quieres iniciar sesión?')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = form.name.trim() && form.email.trim() && form.doc_number.trim() && !loading

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full neo-inset flex items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-20 h-20 rounded-3xl neo flex items-center justify-center mb-6">
        <CheckCircle size={36} style={{ color: '#4ade80' }} />
      </div>
      <h2 className="text-2xl font-black tracking-tight text-center" style={{ color: 'var(--fg)' }}>
        ¡Bienvenido al programa!
      </h2>
      <p className="text-sm mt-2 text-center" style={{ color: 'var(--fg-muted)' }}>
        Tu cuenta fue creada exitosamente
      </p>
      <Loader2 size={18} className="animate-spin mt-8" style={{ color: 'var(--accent)' }} />
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
            Únete al programa y empieza a acumular puntos con cada compra para canjearlos por descuentos y productos gratis.
          </p>

          {/* Benefit bullets */}
          <div className="space-y-3 text-left">
            {[
              { icon: '🎁', text: 'Puntos de bienvenida al unirte' },
              { icon: '📈', text: 'Gana puntos con cada pedido' },
              { icon: '🎂', text: 'Beneficio especial en tu cumpleaños' },
            ].map(item => (
              <div key={item.icon} className="neo-sm rounded-2xl p-3.5 flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — register form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:px-12">

        {/* Mobile header */}
        <div className="md:hidden mb-10 flex flex-col items-center gap-3">
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

          {/* Back link */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-xs font-semibold mb-8 -ml-1"
            style={{ color: 'var(--fg-muted)' }}>
            <ArrowLeft size={14} />
            Volver al inicio
          </button>

          <div className="mb-7">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
              Crea tu cuenta
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
              Únete al programa de puntos PopoloPizza
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Nombre + Apellido */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                       style={{ color: 'var(--fg-muted)' }}>
                  Nombre <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <div className="neo-inset rounded-2xl flex items-center gap-2.5 px-3.5 py-3">
                  <User size={15} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Carlos"
                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium min-w-0
                               placeholder:font-normal placeholder:opacity-40"
                    style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                    autoComplete="given-name"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                       style={{ color: 'var(--fg-muted)' }}>
                  Apellido
                </label>
                <div className="neo-inset rounded-2xl flex items-center gap-2.5 px-3.5 py-3">
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={set('last_name')}
                    placeholder="García"
                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium min-w-0
                               placeholder:font-normal placeholder:opacity-40"
                    style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                    autoComplete="family-name"
                  />
                </div>
              </div>
            </div>

            {/* Correo */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--fg-muted)' }}>
                Correo electrónico <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                <Mail size={16} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="correo@ejemplo.com"
                  className="flex-1 bg-transparent border-none outline-none text-base font-medium
                             placeholder:font-normal placeholder:opacity-40"
                  style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                  inputMode="email"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--fg-muted)' }}>
                Teléfono <span className="font-normal normal-case" style={{ color: 'var(--fg-subtle)' }}>(opcional)</span>
              </label>
              <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                <Phone size={16} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="987 654 321"
                  className="flex-1 bg-transparent border-none outline-none text-base font-medium
                             placeholder:font-normal placeholder:opacity-40"
                  style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Tipo de documento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--fg-muted)' }}>
                Tipo de documento <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <div className="flex gap-2">
                {DOC_TYPES.map(dt => (
                  <button
                    key={dt.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, doc_type: dt.value, doc_number: '' }))}
                    className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold transition-all ${
                      form.doc_type === dt.value ? 'neo-btn-accent' : 'neo-sm'
                    }`}
                    style={{
                      color: form.doc_type === dt.value ? '#fff' : 'var(--fg-muted)',
                    }}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Número de documento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--fg-muted)' }}>
                Número de {currentDocType.label} <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                <CreditCard size={16} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                <input
                  type="text"
                  value={form.doc_number}
                  onChange={set('doc_number')}
                  placeholder={currentDocType.placeholder}
                  maxLength={currentDocType.maxLen}
                  className="flex-1 bg-transparent border-none outline-none text-base font-medium
                             placeholder:font-normal placeholder:opacity-40 uppercase"
                  style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            {/* Fecha de nacimiento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                     style={{ color: 'var(--fg-muted)' }}>
                Fecha de nacimiento <span className="font-normal normal-case" style={{ color: 'var(--fg-subtle)' }}>(para tu regalo de cumpleaños)</span>
              </label>
              <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
                <Calendar size={16} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={set('birth_date')}
                  max={new Date().toISOString().split('T')[0]}
                  className="flex-1 bg-transparent border-none outline-none text-base font-medium"
                  style={{ color: form.birth_date ? 'var(--fg)' : 'var(--fg-subtle)', caretColor: 'var(--accent)' }}
                  autoComplete="bday"
                />
              </div>
            </div>

            {error && (
              <div className="neo-inset-sm rounded-xl px-4 py-3 text-sm font-medium"
                   style={{ color: 'var(--accent)' }}>
                {error}
                {error.includes('iniciar sesión') && (
                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="block mt-1 font-bold underline text-xs"
                    style={{ color: 'var(--accent)' }}>
                    Ir a iniciar sesión →
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full neo-btn-accent rounded-2xl py-4 flex items-center justify-center
                         gap-2 text-white font-bold text-sm disabled:opacity-40
                         disabled:cursor-not-allowed mt-1">
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <><span>Crear mi cuenta</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          {/* Login link */}
          <p className="text-center text-sm mt-7" style={{ color: 'var(--fg-muted)' }}>
            ¿Ya tienes cuenta?{' '}
            <button
              onClick={() => router.push('/')}
              className="font-semibold"
              style={{ color: 'var(--accent)' }}>
              Inicia sesión
            </button>
          </p>

          <p className="text-center text-xs mt-8" style={{ color: 'var(--fg-subtle)' }}>
            © {new Date().getFullYear()} PopoloPizza
          </p>
        </div>
      </div>
    </div>
  )
}
