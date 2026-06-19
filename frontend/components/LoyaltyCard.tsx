'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import type { LoyaltyCard as Card, Partner } from '@/lib/types'

interface Props {
  card: Card
  partner: Partner
  totalPoints: number
}

export default function LoyaltyCard({ card, partner, totalPoints }: Props) {
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
        width: 140,
        margin: 1,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
    }
  }, [qrPayload])

  const initials = partner.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  return (
    <div className="w-full px-4">
      {/* Card container */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl"
           style={{ aspectRatio: '1.586/1', minHeight: 220 }}>

        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#e31e24] via-[#c0392b] to-[#1a1a2e]" />

        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full
                        bg-white/5 border border-white/10" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full
                        bg-brand-orange/20" />

        {/* Shine overlay */}
        <div className="absolute inset-0 card-shine" />

        {/* Content */}
        <div className="absolute inset-0 p-5 flex flex-col justify-between">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest">PopoloPizza</p>
              <p className="text-white font-bold text-lg leading-tight">{card.program.name}</p>
            </div>
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30
                            flex items-center justify-center">
              <span className="text-white font-bold text-sm">{initials}</span>
            </div>
          </div>

          {/* Points */}
          <div className="text-center -mt-2">
            <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Puntos disponibles</p>
            <p className="text-5xl font-black text-white points-glow leading-none">
              {totalPoints.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-white/50 text-xs mt-1">pts</p>
          </div>

          {/* Bottom row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/40 text-xs">Titular</p>
              <p className="text-white font-semibold text-sm truncate max-w-[160px]">{partner.name}</p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-xs">DNI</p>
              <p className="text-white font-mono text-sm">{partner.vat || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* QR Section */}
      <div className="mt-4 bg-brand-card border border-white/10 rounded-2xl p-4
                      flex items-center gap-4">
        <div className="bg-white rounded-xl p-1.5 shadow-inner flex-shrink-0">
          <canvas ref={qrRef} className="rounded-lg" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Muestra este QR</p>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            El cajero lo escaneará para identificarte
          </p>
          <p className="text-gray-500 text-xs mt-2">
            O dicta tu DNI: <span className="text-white font-mono">{partner.vat}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
