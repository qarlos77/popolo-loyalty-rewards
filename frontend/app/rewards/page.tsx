'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronRight, Lock } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import PageShell from '@/components/PageShell'
import RedeemModal from '@/components/RedeemModal'
import type { Reward, MeResponse } from '@/lib/types'

export default function RewardsPage() {
  const router = useRouter()
  const [data,  setData]  = useState<{ total_points: number; rewards: Reward[] } | null>(null)
  const [me,    setMe]    = useState<MeResponse | null>(null)
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

    const poll = setInterval(() => {
      const t = getSession()?.token
      if (!t) return
      odoo.balance(t).then(b => setTotalPoints(b.total_points)).catch(() => {})
    }, 8000)
    return () => clearInterval(poll)
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
    </div>
  )

  const rewards    = data?.rewards || []
  const affordable = rewards.filter(r => r.affordable)
  const locked     = rewards.filter(r => !r.affordable)
  const primaryCard = me?.cards[0]

  return (
    <PageShell>
      <div className="min-h-screen pb-24 md:pb-10">

        {/* Header */}
        <div className="px-5 pt-12 md:pt-8 pb-6 max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider"
             style={{ color: 'var(--fg-muted)' }}>
            Catálogo
          </p>
          <h1 className="text-xl font-bold tracking-tight mt-0.5" style={{ color: 'var(--fg)' }}>
            Premios
          </h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-5 space-y-6">

          {/* Points summary */}
          <div className="neo rounded-2.5xl p-5">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: 'var(--fg-muted)' }}>
                Tus puntos
              </p>
              <p className="text-3xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>
                {totalPoints.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                <span className="text-sm font-semibold ml-1" style={{ color: 'var(--accent)' }}>pts</span>
              </p>
            </div>

            {/* Progress toward next locked reward */}
            {locked.length > 0 && (() => {
              const next = locked[0]
              const pct  = Math.min(100, Math.round((totalPoints / next.required_points) * 100))
              return (
                <div>
                  <div className="flex justify-between text-xs mb-2"
                       style={{ color: 'var(--fg-muted)' }}>
                    <span>Hacia: {next.name}</span>
                    <span className="font-bold" style={{ color: 'var(--accent)' }}>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full neo-inset-sm overflow-hidden">
                    <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs mt-1.5 text-right" style={{ color: 'var(--fg-subtle)' }}>
                    {(next.required_points - totalPoints).toLocaleString()} pts restantes
                  </p>
                </div>
              )
            })()}
          </div>

          {/* Available */}
          {affordable.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                 style={{ color: 'var(--fg-muted)' }}>
                Disponibles para ti
              </p>
              <div className="space-y-2">
                {affordable.map(r => (
                  <RewardRow
                    key={r.id} reward={r}
                    userPoints={totalPoints}
                    onRedeem={() => setSelected(r)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Locked */}
          {locked.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                 style={{ color: 'var(--fg-muted)' }}>
                Proximos premios
              </p>
              <div className="space-y-2 opacity-60">
                {locked.map(r => (
                  <RewardRow
                    key={r.id} reward={r}
                    userPoints={totalPoints}
                    onRedeem={() => {}}
                    locked
                  />
                ))}
              </div>
            </section>
          )}

          {rewards.length === 0 && (
            <div className="neo rounded-3xl py-16 text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                Sin premios configurados
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
                Sigue acumulando puntos con cada compra
              </p>
            </div>
          )}
        </div>
      </div>

      {selected && primaryCard && (
        <RedeemModal
          reward={selected}
          cardId={primaryCard.id}
          onClose={() => setSelected(null)}
          onSuccess={pts => { setTotalPoints(pts); setSelected(null) }}
        />
      )}

      <BottomNav />
    </PageShell>
  )
}

function RewardRow({
  reward, userPoints, onRedeem, locked = false
}: {
  reward: Reward; userPoints: number; onRedeem: () => void; locked?: boolean
}) {
  const pct = Math.min(100, Math.round((userPoints / reward.required_points) * 100))

  return (
    <div className="neo-sm rounded-2xl p-4">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
          {locked
            ? <Lock size={16} style={{ color: 'var(--fg-subtle)' }} />
            : <div className="w-3 h-3 rounded-full" style={{ background: 'var(--accent)' }} />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
            {reward.name}
          </p>
          <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--accent)' }}>
            {reward.required_points.toLocaleString()} pts
          </p>
        </div>

        {/* Action */}
        {!locked ? (
          <button onClick={onRedeem}
            className="neo-btn-accent rounded-xl px-4 py-2 text-white text-xs font-bold
                       flex items-center gap-1 flex-shrink-0">
            Canjear <ChevronRight size={13} />
          </button>
        ) : (
          <p className="text-xs flex-shrink-0" style={{ color: 'var(--fg-subtle)' }}>
            {(reward.required_points - userPoints).toLocaleString()} más
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 rounded-full neo-inset-sm overflow-hidden">
          <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
