'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Gift, Lock } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import RedeemModal from '@/components/RedeemModal'
import type { Reward, MeResponse } from '@/lib/types'

export default function RewardsPage() {
  const router = useRouter()
  const [data, setData] = useState<{ total_points: number; rewards: Reward[] } | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Reward | null>(null)
  const [totalPoints, setTotalPoints] = useState(0)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/'); return }
    Promise.all([odoo.rewards(session.token), odoo.me(session.token)])
      .then(([r, m]) => { setData(r); setMe(m); setTotalPoints(r.total_points) })
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))

    // Poll points every 8s
    const poll = setInterval(() => {
      const t = getSession()?.token
      if (!t) return
      odoo.balance(t).then(b => setTotalPoints(b.total_points)).catch(() => {})
    }, 8000)
    return () => clearInterval(poll)
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={36} className="animate-spin text-brand-orange" />
    </div>
  )

  const rewards = data?.rewards || []
  const affordable = rewards.filter(r => r.affordable)
  const locked = rewards.filter(r => !r.affordable)
  const primaryCard = me?.cards[0]

  return (
    <div className="min-h-screen bg-brand-dark pb-28">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-white font-bold text-2xl">Premios 🎁</h1>
        <p className="text-gray-400 text-sm mt-1">Canjea tus puntos por recompensas</p>
      </div>

      {/* Points pill */}
      <div className="mx-4 mb-6 bg-gradient-to-r from-brand-red to-brand-orange
                      rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs uppercase tracking-wider">Tus puntos</p>
          <p className="text-white font-black text-3xl points-glow">
            {totalPoints.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-4xl">🍕</div>
      </div>

      {/* Available rewards */}
      {affordable.length > 0 && (
        <section className="px-4 mb-6">
          <p className="text-white font-semibold mb-3 flex items-center gap-2">
            <Gift size={18} className="text-brand-orange" /> Disponibles para ti
          </p>
          <div className="space-y-3">
            {affordable.map(reward => (
              <RewardCard
                key={reward.id}
                reward={reward}
                userPoints={totalPoints}
                onRedeem={() => setSelected(reward)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Locked rewards */}
      {locked.length > 0 && (
        <section className="px-4">
          <p className="text-gray-400 font-semibold mb-3 flex items-center gap-2">
            <Lock size={16} /> Próximos premios
          </p>
          <div className="space-y-3 opacity-70">
            {locked.map(reward => (
              <RewardCard
                key={reward.id}
                reward={reward}
                userPoints={totalPoints}
                onRedeem={() => {}}
                locked
              />
            ))}
          </div>
        </section>
      )}

      {rewards.length === 0 && (
        <div className="flex flex-col items-center py-16 px-8 text-center">
          <div className="text-5xl mb-4">🍕</div>
          <p className="text-white font-semibold">No hay premios configurados aún</p>
          <p className="text-gray-400 text-sm mt-2">Sigue acumulando puntos con cada compra</p>
        </div>
      )}

      {selected && primaryCard && (
        <RedeemModal
          reward={selected}
          cardId={primaryCard.id}
          onClose={() => setSelected(null)}
          onSuccess={pts => { setTotalPoints(pts); setSelected(null) }}
        />
      )}

      <BottomNav />
    </div>
  )
}

function RewardCard({
  reward, userPoints, onRedeem, locked = false
}: {
  reward: Reward; userPoints: number; onRedeem: () => void; locked?: boolean
}) {
  const pct = Math.min(100, (userPoints / reward.required_points) * 100)
  const emoji = reward.reward_type === 'free_product' ? '🍕'
    : reward.reward_type === 'discount' ? '💸' : '🎁'

  return (
    <div className={`bg-brand-card border rounded-2xl p-4
      ${locked ? 'border-white/5' : 'border-brand-orange/30'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0
          ${locked ? 'bg-white/5' : 'bg-brand-orange/20'}`}>
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold leading-snug">{reward.name}</p>
          <p className="text-brand-orange text-sm font-bold mt-0.5">
            {reward.required_points.toLocaleString()} pts
          </p>
          {reward.discount && (
            <p className="text-gray-400 text-xs mt-0.5">{reward.discount}% de descuento</p>
          )}
        </div>
        {!locked ? (
          <button onClick={onRedeem}
            className="flex-shrink-0 bg-gradient-to-r from-brand-red to-brand-orange
                       text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">
            Canjear
          </button>
        ) : (
          <div className="flex-shrink-0 flex items-center gap-1 text-gray-500 text-xs">
            <Lock size={12} />
            {(reward.required_points - userPoints).toLocaleString()} pts más
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500
              ${locked ? 'bg-gray-600' : 'bg-gradient-to-r from-brand-red to-brand-orange'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-gray-500 text-xs mt-1 text-right">{Math.floor(pct)}%</p>
      </div>
    </div>
  )
}
