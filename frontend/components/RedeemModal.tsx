'use client'
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { X, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
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
  const [stage, setStage] = useState<Stage>('confirm')
  const [errorMsg, setErrorMsg] = useState('')
  const [txnData, setTxnData] = useState<{
    code: string; expires_at: string; qr_payload: string; points_remaining: number
  } | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const expiryRef = useRef<ReturnType<typeof setInterval>>()
  const [secondsLeft, setSecondsLeft] = useState(600)

  useEffect(() => {
    if (stage === 'success' && txnData && qrRef.current) {
      QRCode.toCanvas(qrRef.current, txnData.qr_payload, {
        width: 220, margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })

      // Countdown
      const expiry = new Date(txnData.expires_at).getTime()
      expiryRef.current = setInterval(() => {
        const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000))
        setSecondsLeft(left)
        if (left <= 0) {
          clearInterval(expiryRef.current)
          onClose()
        }
      }, 1000)
    }
    return () => clearInterval(expiryRef.current)
  }, [stage, txnData, onClose])

  async function handleRedeem() {
    setStage('loading')
    try {
      const token = getToken()!
      const res = await odoo.redeem(token, cardId, reward.id)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-[430px] bg-brand-card rounded-t-3xl p-6
                      animate-bounce-in border-t border-white/10">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 active:text-white">
          <X size={24} />
        </button>

        {stage === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-brand-orange/20 flex items-center
                              justify-center mx-auto mb-4">
                <span className="text-3xl">🎁</span>
              </div>
              <h2 className="text-white font-bold text-xl">{reward.name}</h2>
              <p className="text-brand-orange font-semibold mt-1">
                {reward.required_points.toLocaleString()} puntos
              </p>
            </div>
            <div className="bg-brand-dark rounded-2xl p-4 text-sm text-gray-400">
              Al canjear, se generará un <strong className="text-white">código QR</strong>{' '}
              que el cajero debe escanear en los próximos <strong className="text-white">10 minutos</strong>.
            </div>
            <button onClick={handleRedeem}
              className="w-full bg-gradient-to-r from-brand-red to-brand-orange
                         text-white font-bold py-4 rounded-2xl active:scale-95 transition-all">
              Canjear ahora
            </button>
          </div>
        )}

        {stage === 'loading' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 size={40} className="animate-spin text-brand-orange" />
            <p className="text-gray-400">Procesando canje...</p>
          </div>
        )}

        {stage === 'success' && txnData && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={28} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="text-white font-bold">¡Canje exitoso!</p>
                <p className="text-gray-400 text-sm">{reward.name}</p>
              </div>
            </div>

            {/* QR to show cashier */}
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center">
              <canvas ref={qrRef} className="rounded-xl" />
              <p className="text-brand-dark font-bold text-2xl tracking-[0.3em] mt-3">
                {txnData.code}
              </p>
              <p className="text-gray-500 text-xs mt-1">Muestra al cajero</p>
            </div>

            {/* Timer */}
            <div className="bg-brand-dark rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-gray-400 text-sm">Expira en</p>
              <p className={`font-mono font-bold text-lg ${secondsLeft < 60 ? 'text-red-400' : 'text-brand-orange'}`}>
                {mins}:{secs.toString().padStart(2, '0')}
              </p>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle size={28} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-white font-bold">Error al canjear</p>
                <p className="text-red-400 text-sm">{errorMsg}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-full bg-brand-dark border border-white/20 text-white
                         font-semibold py-3 rounded-2xl">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
