'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import type { LoyaltyCard as Card, Partner } from '@/lib/types'

interface Props {
  card: Card
  partner: Partner
  totalPoints: number
  nextRewardPts?: number
  nextRewardName?: string
}

export default function LoyaltyCard({
  card, partner, totalPoints, nextRewardPts, nextRewardName
}: Props) {
  const qrRef = useRef<HTMLCanvasElement>(null)

  const qrPayload = JSON.stringify({
    type: 'loyalty_card',
    code: card.code,
    partner_id: partner.id,
    vat: partner.vat,
  })

  useEffect(() => {
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, qrPayload, {
        width: 120,
        margin: 1,
        color: { dark: '#1e2030', light: '#eaedf3' },
        errorCorrectionLevel: 'M',
      })
    }
  }, [qrPayload])

  const pct = nextRewardPts
    ? Math.min(100, Math.round((totalPoints / nextRewardPts) * 100))
    : 100

  const remaining = nextRewardPts ? Math.max(0, nextRewardPts - totalPoints) : 0

  return (
    <div className="w-full px-4 md:px-0 space-y-3">

      {/* Points card */}
      <div className="neo rounded-3xl p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest"
               style={{ color: 'var(--fg-muted)' }}>
              {card.program.name}
            </p>
            <p className="text-sm font-medium mt-0.5 truncate max-w-[180px]"
               style={{ color: 'var(--fg-subtle)' }}>
              {partner.name}
            </p>
          </div>
          <div className="neo-inset-sm rounded-full w-10 h-10 flex items-center justify-center">
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
              {partner.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Points */}
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-1"
             style={{ color: 'var(--fg-muted)' }}>
            Puntos disponibles
          </p>
          <p className="text-5xl font-black tracking-tight leading-none"
             style={{ color: 'var(--fg)' }}>
            {totalPoints.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
            <span className="text-xl font-semibold ml-2" style={{ color: 'var(--accent)' }}>pts</span>
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
              {nextRewardName
                ? `Hacia: ${nextRewardName}`
                : 'Sin premios configurados'}
            </p>
            <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
              {nextRewardPts ? `${pct}%` : ''}
            </p>
          </div>
          <div className="h-2 rounded-full neo-inset-sm overflow-hidden">
            <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
          </div>
          {remaining > 0 && (
            <p className="text-xs mt-1.5 text-right" style={{ color: 'var(--fg-subtle)' }}>
              {remaining.toLocaleString()} pts restantes
            </p>
          )}
        </div>
      </div>

      {/* QR card */}
      <div className="neo-sm rounded-2.5xl p-4 flex items-center gap-4">
        <div className="neo-inset-sm rounded-xl p-1.5 flex-shrink-0">
          <canvas ref={qrRef} className="block rounded-lg" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
            Código de identificación
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
            Muéstraselo al cajero para acumular o canjear puntos
          </p>
          {partner.vat && (
            <p className="text-xs mt-2 font-mono" style={{ color: 'var(--fg-subtle)' }}>
              DNI {partner.vat}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
