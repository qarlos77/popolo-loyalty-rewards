'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, TrendingUp, Gift } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession, clearSession } from '@/lib/auth'
import LoyaltyCard from '@/components/LoyaltyCard'
import BottomNav from '@/components/BottomNav'
import PageShell from '@/components/PageShell'
import type { MeResponse, HistoryItem, Reward, BirthdayInfo } from '@/lib/types'

export default function DashboardPage() {
  const router = useRouter()
  const [data,    setData]    = useState<MeResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const token = getSession()?.token
      if (!token) { router.replace('/'); return }
      const [me, hist, rwd] = await Promise.all([
        odoo.me(token),
        odoo.history(token, 5),
        odoo.rewards(token),
      ])
      setData(me)
      setHistory(hist.history)
      setRewards(rwd.rewards)
    } catch {
      clearSession()
      router.replace('/')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/'); return }
    load()
    const interval = setInterval(() => {
      const token = getSession()?.token
      if (!token) return
      odoo.balance(token).then(b => {
        setData(prev => prev ? { ...prev, total_points: b.total_points } : prev)
      }).catch(() => {})
    }, 8000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
    </div>
  )

  if (!data) return null

  const primaryCard = data.cards[0]
  const nextReward  = rewards.find(r => r.required_points > data.total_points)
  const totalEarned = history.filter(h => h.type === 'earned').reduce((s, h) => s + h.points, 0)
  const bday        = data.birthday

  return (
    <PageShell>
      <div className="min-h-screen pb-24 md:pb-10">

        {/* Birthday banner */}
        {bday?.is_today && (
          <BirthdayBanner
            name={data.partner.name.split(' ')[0]}
            bday={bday}
          />
        )}

        {/* Header */}
        <div className="px-5 pt-12 md:pt-8 pb-6 flex items-center justify-between max-w-3xl mx-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider"
               style={{ color: 'var(--fg-muted)' }}>
              Bienvenido
            </p>
            <h1 className="text-xl font-bold tracking-tight mt-0.5" style={{ color: 'var(--fg)' }}>
              {data.partner.name.split(' ')[0]}
            </h1>
          </div>
          <button
            onClick={() => load(true)}
            className="w-10 h-10 rounded-xl neo-btn flex items-center justify-center"
            style={{ color: 'var(--fg-muted)' }}>
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* 2-col on desktop */}
        <div className="max-w-3xl mx-auto md:grid md:grid-cols-2 md:gap-5 md:items-start px-0 md:px-5">

          {/* Left: card */}
          {primaryCard && (
            <LoyaltyCard
              card={primaryCard}
              partner={data.partner}
              totalPoints={data.total_points}
              nextRewardPts={nextReward?.required_points}
              nextRewardName={nextReward?.name}
            />
          )}

          {/* Right: stats + history */}
          <div className="px-4 md:px-0 space-y-4 mt-4 md:mt-0">

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="neo-sm rounded-2xl p-4">
                <p className="text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'var(--fg-muted)' }}>
                  Ganados
                </p>
                <p className="text-2xl font-black mt-1 tracking-tight" style={{ color: 'var(--fg)' }}>
                  {totalEarned.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>puntos totales</p>
              </div>
              <div className="neo-sm rounded-2xl p-4">
                <p className="text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'var(--fg-muted)' }}>
                  Programas
                </p>
                <p className="text-2xl font-black mt-1 tracking-tight" style={{ color: 'var(--fg)' }}>
                  {data.cards.length}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>activos</p>
              </div>
            </div>

            {/* Recent history */}
            {history.length > 0 && (
              <div className="neo rounded-2.5xl p-4 space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider"
                     style={{ color: 'var(--fg-muted)' }}>
                    Actividad reciente
                  </p>
                  <button onClick={() => router.push('/history')}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--accent)' }}>
                    Ver todo
                  </button>
                </div>
                {history.map((item, i) => (
                  <div key={item.id}
                    className={`flex items-center gap-3 py-2.5 ${
                      i < history.length - 1 ? 'border-b' : ''
                    }`}
                    style={{ borderColor: 'var(--border)' }}>
                    <div className="w-8 h-8 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
                      <TrendingUp
                        size={14}
                        style={{ color: item.type === 'earned' ? '#4ade80' : 'var(--accent)' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--fg)' }}>
                        {item.description}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--fg-subtle)' }}>
                        {new Date(item.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <p className="text-sm font-bold flex-shrink-0"
                       style={{ color: item.points >= 0 ? '#4ade80' : 'var(--accent)' }}>
                      {item.points >= 0 ? '+' : ''}
                      {item.points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <BottomNav />
    </PageShell>
  )
}

/* ── Birthday Banner ─────────────────────────────────────────────────────── */
function BirthdayBanner({ name, bday }: { name: string; bday: BirthdayInfo }) {
  const pts     = bday.birthday_points_awarded || bday.birthday_points_config
  const product = bday.gift_product

  return (
    <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#ff6b35,#f7c59f,#ff6b35)', backgroundSize:'200% 200%', animation:'bdayGradient 4s ease infinite' }}>
      <style>{`
        @keyframes bdayGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes bdayFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      `}</style>

      {/* Floating emoji confetti */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {['🎉','🎂','✨','🎊','⭐'].map((e, i) => (
          <span key={i} className="absolute text-2xl opacity-25"
            style={{ left:`${8+i*20}%`, top:`${8+(i%3)*22}%`, animation:`bdayFloat ${2+i*0.4}s ease-in-out infinite`, animationDelay:`${i*0.3}s` }}>
            {e}
          </span>
        ))}
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-1">🎂 ¡Hoy es tu cumpleaños!</p>
            <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
              ¡Feliz cumpleaños,<br />{name}!
            </h2>
            {pts > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2">
                <TrendingUp size={15} className="text-white flex-shrink-0" />
                <span className="text-white font-bold text-sm">
                  Has ganado <span className="text-lg font-black">{pts.toLocaleString('es-PE',{maximumFractionDigits:0})}</span> puntos de regalo 🎁
                </span>
              </div>
            )}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0"
               style={{ animation:'bdayFloat 2.5s ease-in-out infinite' }}>
            <Gift size={28} className="text-white" />
          </div>
        </div>

        {product && (
          <div className="mt-4 bg-white/95 rounded-2xl p-4 flex items-center gap-4 shadow-lg">
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover"
                   onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color:'#ff6b35' }}>
                Regalo exclusivo en el local
              </p>
              <p className="font-bold text-gray-800 leading-tight">{product.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">Preséntate en el local para reclamarlo</p>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:'#ff6b35' }}>
              <Gift size={16} className="text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
