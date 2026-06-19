'use client'
import { useState, useEffect, useCallback } from 'react'
import { Lock, Server, CheckCircle, XCircle, Loader2, Save, RefreshCw, LogOut, Eye, EyeOff } from 'lucide-react'

const SESSION_KEY = 'popolo_admin_pw'

type Status = 'idle' | 'testing' | 'ok' | 'error'

interface TestResult {
  ok: boolean
  status?: number
  latency?: number
  odoo_url?: string
  error?: string
}

export default function AdminPage() {
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [authed,      setAuthed]      = useState(false)
  const [authErr,     setAuthErr]     = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [odooUrl,  setOdooUrl]  = useState('')
  const [editing,  setEditing]  = useState(false)
  const [editUrl,  setEditUrl]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  const [status,    setStatus]    = useState<Status>('idle')
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const stored = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null

  // Auto-login if password already in session
  useEffect(() => {
    if (stored) loadConfig(stored)
  }, []) // eslint-disable-line

  const loadConfig = useCallback(async (pw: string) => {
    setAuthLoading(true)
    setAuthErr('')
    try {
      const res = await fetch('/api/admin/config', {
        headers: { 'x-admin-password': pw },
      })
      if (res.status === 401) { setAuthErr('Contraseña incorrecta'); return }
      if (!res.ok) { setAuthErr('Error al cargar configuración'); return }
      const data = await res.json()
      setOdooUrl(data.odoo_url || '')
      setEditUrl(data.odoo_url || '')
      sessionStorage.setItem(SESSION_KEY, pw)
      setAuthed(true)
    } catch {
      setAuthErr('Error de conexión')
    } finally {
      setAuthLoading(false)
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    await loadConfig(password)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const pw = sessionStorage.getItem(SESSION_KEY) || ''
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ odoo_url: editUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveMsg(data.error || 'Error al guardar'); return }
      setOdooUrl(data.odoo_url)
      setEditUrl(data.odoo_url)
      setEditing(false)
      setSaveMsg('Guardado correctamente')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch {
      setSaveMsg('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setStatus('testing')
    setTestResult(null)
    const pw = sessionStorage.getItem(SESSION_KEY) || ''
    try {
      const res  = await fetch('/api/admin/test', { headers: { 'x-admin-password': pw } })
      const data = await res.json()
      setTestResult(data)
      setStatus(data.ok ? 'ok' : 'error')
    } catch {
      setTestResult({ ok: false, error: 'Error de red' })
      setStatus('error')
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setAuthed(false)
    setPassword('')
    setStatus('idle')
    setTestResult(null)
  }

  /* ── Login screen ────────────────────────────────────────────── */
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 rounded-2xl neo flex items-center justify-center mb-5">
            <Lock size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            Panel Administrativo
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
            rewards.popolopizza.com
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-3"
                   style={{ color: 'var(--fg-muted)' }}>
              Contraseña de administrador
            </label>
            <div className="neo-inset rounded-2xl flex items-center gap-3 px-4 py-3.5">
              <Lock size={16} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                required
                autoFocus
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="flex-shrink-0" style={{ color: 'var(--fg-subtle)' }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {authErr && (
            <p className="text-xs font-medium px-1" style={{ color: 'var(--accent)' }}>
              {authErr}
            </p>
          )}

          <button type="submit" disabled={authLoading || !password}
            className="w-full neo-btn-accent rounded-2xl py-3.5 text-white font-bold text-sm
                       flex items-center justify-center gap-2 disabled:opacity-40">
            {authLoading
              ? <Loader2 size={17} className="animate-spin" />
              : 'Ingresar'
            }
          </button>
        </form>

        <p className="text-center text-xs mt-8" style={{ color: 'var(--fg-subtle)' }}>
          La contraseña se configura con la variable de entorno{' '}
          <code className="font-mono">ADMIN_PASSWORD</code>
        </p>
      </div>
    </div>
  )

  /* ── Config panel ────────────────────────────────────────────── */
  return (
    <div className="min-h-screen px-5 py-10 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider"
             style={{ color: 'var(--fg-muted)' }}>
            Administración
          </p>
          <h1 className="text-xl font-bold tracking-tight mt-0.5" style={{ color: 'var(--fg)' }}>
            Configuración
          </h1>
        </div>
        <button onClick={logout}
          className="w-9 h-9 rounded-xl neo-btn flex items-center justify-center"
          style={{ color: 'var(--fg-muted)' }}>
          <LogOut size={16} />
        </button>
      </div>

      {/* Odoo URL card */}
      <div className="neo rounded-2.5xl p-5 space-y-5">

        {/* Section title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
            <Server size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
              Instancia de Odoo
            </p>
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              URL base del servidor Odoo
            </p>
          </div>
        </div>

        {/* URL display / edit */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-3"
                 style={{ color: 'var(--fg-muted)' }}>
            URL
          </label>
          {editing ? (
            <div className="neo-inset rounded-2xl flex items-center px-4 py-3.5">
              <input
                type="url"
                value={editUrl}
                onChange={e => setEditUrl(e.target.value)}
                placeholder="https://sistema.tudominio.com"
                className="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                style={{ color: 'var(--fg)', caretColor: 'var(--accent)' }}
                autoFocus
              />
            </div>
          ) : (
            <div className="neo-inset rounded-2xl px-4 py-3.5">
              <p className="text-sm font-mono font-medium" style={{ color: 'var(--fg)' }}>
                {odooUrl}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving || !editUrl.trim()}
                className="flex-1 neo-btn-accent rounded-xl py-2.5 text-white text-sm font-semibold
                           flex items-center justify-center gap-1.5 disabled:opacity-40">
                {saving
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><Save size={14} /> Guardar</>
                }
              </button>
              <button onClick={() => { setEditing(false); setEditUrl(odooUrl) }}
                className="neo-btn rounded-xl px-4 py-2.5 text-sm font-semibold"
                style={{ color: 'var(--fg-muted)' }}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="flex-1 neo-btn rounded-xl py-2.5 text-sm font-semibold
                           flex items-center justify-center gap-1.5"
                style={{ color: 'var(--fg)' }}>
                Editar URL
              </button>
              <button onClick={handleTest} disabled={status === 'testing'}
                className="neo-btn rounded-xl px-4 py-2.5 text-sm font-semibold
                           flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ color: 'var(--fg-muted)' }}>
                {status === 'testing'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><RefreshCw size={14} /> Probar</>
                }
              </button>
            </>
          )}
        </div>

        {/* Save confirmation */}
        {saveMsg && (
          <p className="text-xs font-medium" style={{ color: '#4ade80' }}>{saveMsg}</p>
        )}

        {/* Test result */}
        {testResult && status !== 'testing' && (
          <div className={`neo-inset-sm rounded-xl px-4 py-3 space-y-1`}>
            <div className="flex items-center gap-2">
              {testResult.ok
                ? <CheckCircle size={15} style={{ color: '#4ade80' }} />
                : <XCircle    size={15} style={{ color: 'var(--accent)' }} />
              }
              <p className="text-sm font-semibold"
                 style={{ color: testResult.ok ? '#4ade80' : 'var(--accent)' }}>
                {testResult.ok ? 'Conexión exitosa' : 'Sin conexión'}
              </p>
              {testResult.latency && (
                <span className="ml-auto text-xs font-mono" style={{ color: 'var(--fg-subtle)' }}>
                  {testResult.latency}ms
                </span>
              )}
            </div>
            {testResult.error && (
              <p className="text-xs pl-5" style={{ color: 'var(--fg-muted)' }}>
                {testResult.error}
              </p>
            )}
            {testResult.status && (
              <p className="text-xs pl-5 font-mono" style={{ color: 'var(--fg-subtle)' }}>
                HTTP {testResult.status} · {testResult.odoo_url}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="neo-sm rounded-2xl p-4 mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider"
           style={{ color: 'var(--fg-muted)' }}>
          Cómo funciona
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
          El frontend actúa como proxy: todas las peticiones a{' '}
          <code className="font-mono" style={{ color: 'var(--fg)' }}>/api/loyalty/*</code>
          {' '}se reenvían a la URL de Odoo configurada aquí. El cambio aplica de inmediato
          sin necesidad de reiniciar el contenedor.
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
          La contraseña de este panel se configura con la variable de entorno{' '}
          <code className="font-mono" style={{ color: 'var(--fg)' }}>ADMIN_PASSWORD</code>
          {' '}en el archivo <code className="font-mono" style={{ color: 'var(--fg)' }}>.env</code>.
        </p>
      </div>

      <p className="text-center text-xs mt-8" style={{ color: 'var(--fg-subtle)' }}>
        PopoloPizza Rewards · Panel Admin
      </p>
    </div>
  )
}
