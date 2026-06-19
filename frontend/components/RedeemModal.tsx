'use client'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { X, Check, Loader2, AlertCircle } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getToken } from '@/lib/auth'
import type { Reward } from '@/lib/types'

interface Props {
  reward: Reward
  cardId: number
  onClose: () => void
  onSuccess: (remainingPoints: number) => void
}

type Stage = 'confirm' | 'loading' | 'success' | 'error'

export default function RedeemModal({ reward, cardId, onClose, onSuccess }: Props) {
  const [stage,    setStage]    = useState<Stage>('confirm')
  const [errorMsg, setErrorMsg] = useState('')
  const [txnData,  setTxnData]  = useState<{
    code: string; expires_at: string; qr_payload: string; points_remaining: number
  } | null>(null)
  const qrRef    = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const [secondsLeft, setSecondsLeft] = useState(600)

  useEffect(() => {
    if (stage === 'success' && txnData && qrRef.current) {
      QRCode.toCanvas(qrRef.current, txnData.qr_payload, {
        width: 190, margin: 2,
        color: { dark: '#1e2030', light: '#eaedf3' },
        errorCorrectionLevel: 'M',
      })
      const expiry = new Date(txnData.expires_at).getTime()
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000))
        setSecondsLeft(left)
        if (left <= 0) { clearInterval(timerRef.current); onClose() }
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [stage, txnData, onClose])

  async function handleRedeem() {
    setStage('loading')
    try {
      const res = await odoo.redeem(getToken()!, cardId, reward.id)
      setTxnData({
        code: res.confirmation_code,
        expires_at: res.expires_at,
        qr_payload: res.qr_payload,
        points_remaining: res.points_remaining,
      })
      setStage('success')
      onSuccess(res.points_remaining)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al canjear')
      setStage('error')
    }
  }

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timerPct = (secondsLeft / 600) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 backdrop-blur-sm"
           style={{ background: 'rgba(0,0,0,0.5)' }}
           onClick={onClose} />

      <div className="relative w-full md:max-w-sm animate-bounce-in
                      rounded-t-3xl md:rounded-3xl p-6 mx-0 md:mx-4"
           style={{ background: 'var(--bg)' }}>

        <button onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl neo-sm
                     flex items-center justify-center"
          style={{ color: 'var(--fg-muted)' }}>
          <X size={16} />
        </button>

        {/* ── Confirm ── */}
        {stage === 'confirm' && (
          <div className="space-y-5 pt-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: 'var(--fg-muted)' }}>
                Confirmar canje
              </p>
              <h2 className="text-lg font-bold mt-1 tracking-tight" style={{ color: 'var(--fg)' }}>
                {reward.name}
              </h2>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>
                {reward.required_points.toLocaleString()} puntos
              </p>
            </div>

            <div className="neo-inset rounded-2xl px-4 py-3 text-sm"
                 style={{ color: 'var(--fg-muted)' }}>
              Se generará un código QR válido por{' '}
              <span className="font-semibold" style={{ color: 'var(--fg)' }}>10 minutos</span>.
              Muéstraselo al cajero para completar el canje.
            </div>

            <button onClick={handleRedeem}
              className="w-full neo-btn-accent rounded-2xl py-4 text-white font-bold text-sm">
              Confirmar canje
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {stage === 'loading' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Procesando...</p>
          </div>
        )}

        {/* ── Success ── */}
        {stage === 'success' && txnData && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
                <Check size={16} style={{ color: '#4ade80' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Canje exitoso</p>
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{reward.name}</p>
              </div>
            </div>

            {/* QR */}
            <div className="neo-inset rounded-2xl p-4 flex flex-col items-center">
              <canvas ref={qrRef} className="block rounded-xl" />
              <p className="font-mono font-black text-2xl tracking-[0.25em] mt-3"
                 style={{ color: 'var(--fg)' }}>
                {txnData.code}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                Muestra al cajero
              </p>
            </div>

            {/* Timer */}
            <div className="neo-sm rounded-2xl p-3 space-y-2">
              <div className="flex justify-between items-baseline">
                <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>Expira en</p>
                <p className="font-mono font-bold text-base"
                   style={{ color: secondsLeft < 60 ? 'var(--accent)' : 'var(--fg)' }}>
                  {mins}:{secs.toString().padStart(2, '0')}
                </p>
              </div>
              <div className="h-1.5 rounded-full neo-inset-sm overflow-hidden">
                <div className="progress-fill h-full transition-none"
                     style={{ width: `${timerPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
                <AlertCircle size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Error al canjear</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>{errorMsg}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-full neo-btn rounded-2xl py-3.5 text-sm font-semibold"
              style={{ color: 'var(--fg)' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
