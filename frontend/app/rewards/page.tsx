'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronRight, Lock, Tag, Copy, Check } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import PageShell from '@/components/PageShell'
import RedeemModal from '@/components/RedeemModal'
import type { Reward, MeResponse, Coupon } from '@/lib/types'

export default function RewardsPage() {
  const router = useRouter()
  const [data,    setData]    = useState<{ total_points: number; rewards: Reward[] } | null>(null)
  const [me,      setMe]      = useState<MeResponse | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Reward | null>(null)
  const [totalPoints, setTotalPoints] = useState(0)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/'); return }
    Promise.all([
      odoo.rewards(session.token),
      odoo.me(session.token),
      odoo.coupons(session.token),
    ])
      .then(([r, m, c]) => {
        setData(r)
        setMe(m)
        setTotalPoints(r.total_points)
        setCoupons(c.coupons)
      })
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

  const rewards      = data?.rewards || []
  const affordable   = rewards.filter(r => r.affordable)
  const locked       = rewards.filter(r => !r.affordable)
  const primaryCard  = me?.cards[0]
  const availCoupons = coupons.filter(c => c.available)
  const usedCoupons  = coupons.filter(c => !c.available)

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

          {/* ── Cupones ── */}
          {coupons.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                 style={{ color: 'var(--fg-muted)' }}>
                Tus cupones
              </p>
              <div className="space-y-2">
                {availCoupons.map(c => <CouponCard key={c.id} coupon={c} />)}
                {usedCoupons.length > 0 && (
                  <div className="opacity-50">
                    {usedCoupons.map(c => <CouponCard key={c.id} coupon={c} used />)}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Premios por puntos ── */}
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

          {locked.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                 style={{ color: 'var(--fg-muted)' }}>
                Próximos premios
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

          {rewards.length === 0 && coupons.length === 0 && (
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

/* ── Coupon Card ─────────────────────────────────────────────────────────── */
function CouponCard({ coupon, used = false }: { coupon: Coupon; used?: boolean }) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(coupon.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const desc = coupon.reward?.description || coupon.program_name

  return (
    <div className="neo-sm rounded-2xl p-4" style={used ? { opacity: 0.55 } : {}}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0 mt-0.5">
          <Tag size={17} style={{ color: used ? 'var(--fg-subtle)' : 'var(--accent)' }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold" style={{ color: 'var(--fg)' }}>
              {coupon.program_name}
            </p>
            {used && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--border)', color: 'var(--fg-subtle)' }}>
                Usado
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--fg-muted)' }}>
            {desc}
          </p>
          {coupon.expiration_date && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--fg-subtle)' }}>
              Válido hasta {new Date(coupon.expiration_date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Code row */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 neo-inset-sm rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-bold tracking-widest truncate"
                style={{ color: used ? 'var(--fg-subtle)' : 'var(--fg)', letterSpacing: '0.15em' }}>
            {coupon.code}
          </span>
        </div>
        {!used && (
          <button
            onClick={copyCode}
            className="flex-shrink-0 w-10 h-10 rounded-xl neo-btn flex items-center justify-center transition-all"
            title="Copiar código"
            style={{ color: copied ? '#4ade80' : 'var(--fg-muted)' }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        )}
      </div>

      {!used && (
        <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--fg-subtle)' }}>
          Usa este código en tu próximo pedido
        </p>
      )}
    </div>
  )
}

/* ── Reward Row ──────────────────────────────────────────────────────────── */
function RewardRow({
  reward, userPoints, onRedeem, locked = false
}: {
  reward: Reward; userPoints: number; onRedeem: () => void; locked?: boolean
}) {
  const pct = Math.min(100, Math.round((userPoints / reward.required_points) * 100))

  return (
    <div className="neo-sm rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
          {locked
            ? <Lock size={16} style={{ color: 'var(--fg-subtle)' }} />
            : <div className="w-3 h-3 rounded-full" style={{ background: 'var(--accent)' }} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
            {reward.name}
          </p>
          <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--accent)' }}>
            {reward.required_points.toLocaleString()} pts
          </p>
        </div>

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

      <div className="mt-3">
        <div className="h-1.5 rounded-full neo-inset-sm overflow-hidden">
          <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
