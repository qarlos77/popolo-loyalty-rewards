'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2, RefreshCw } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession, clearSession } from '@/lib/auth'
import LoyaltyCard from '@/components/LoyaltyCard'
import BottomNav from '@/components/BottomNav'
import type { MeResponse, HistoryItem } from '@/lib/types'

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<MeResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const session = typeof window !== 'undefined' ? getSession() : null

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const token = session?.token
      if (!token) { router.replace('/'); return }
      const [me, hist] = await Promise.all([
        odoo.me(token),
        odoo.history(token, 5),
      ])
      setData(me)
      setHistory(hist.history)
    } catch {
      clearSession()
      router.replace('/')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [session?.token, router])

  useEffect(() => {
    if (!session) { router.replace('/'); return }
    load()
    // Poll balance every 8 seconds (real-time anti-double-redeem)
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
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={36} className="animate-spin text-brand-orange" />
        <p className="text-gray-400 text-sm">Cargando tus puntos...</p>
      </div>
    </div>
  )

  if (!data) return null
  const primaryCard = data.cards[0]

  return (
    <div className="min-h-screen bg-brand-dark pb-28">
      {/* Header */}
      <div className="px-5 pt-12 pb-6 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">Bienvenido,</p>
          <h1 className="text-white font-bold text-xl leading-tight">
            {data.partner.name.split(' ')[0]} 👋
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load(true)}
            className={`text-gray-400 active:text-white transition-colors ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw size={20} />
          </button>
          <button className="relative text-gray-400 active:text-white">
            <Bell size={22} />
          </button>
        </div>
      </div>

      {/* Loyalty Card + QR */}
      {primaryCard && (
        <LoyaltyCard
          card={primaryCard}
          partner={data.partner}
          totalPoints={data.total_points}
        />
      )}

      {/* Multiple programs */}
      {data.cards.length > 1 && (
        <div className="px-4 mt-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2 ml-1">Más programas</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.cards.slice(1).map(card => (
              <div key={card.id}
                className="flex-shrink-0 bg-brand-card border border-white/10 rounded-2xl p-4 w-44">
                <p className="text-gray-400 text-xs truncate">{card.program.name}</p>
                <p className="text-white font-bold text-2xl mt-1">
                  {card.points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-brand-orange text-xs">puntos</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="px-4 mt-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-brand-card border border-white/10 rounded-2xl p-4">
            <p className="text-gray-400 text-xs">Total acumulado</p>
            <p className="text-white font-bold text-2xl mt-1">
              {data.total_points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
              <span className="text-brand-orange text-sm font-normal ml-1">pts</span>
            </p>
          </div>
          <div className="bg-brand-card border border-white/10 rounded-2xl p-4">
            <p className="text-gray-400 text-xs">Tarjetas activas</p>
            <p className="text-white font-bold text-2xl mt-1">
              {data.cards.length}
              <span className="text-blue-400 text-sm font-normal ml-1">prog.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold">Actividad reciente</p>
            <button onClick={() => router.push('/history')}
              className="text-brand-orange text-sm">Ver todo</button>
          </div>
          <div className="space-y-2">
            {history.map(item => (
              <div key={item.id}
                className="flex items-center gap-3 bg-brand-card border border-white/5
                           rounded-2xl px-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0
                  ${item.type === 'earned' ? 'bg-green-500/20' : 'bg-brand-orange/20'}`}>
                  {item.type === 'earned' ? '⬆️' : '🎁'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.description}</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(item.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <p className={`font-bold text-base flex-shrink-0
                  ${item.points >= 0 ? 'text-green-400' : 'text-brand-orange'}`}>
                  {item.points >= 0 ? '+' : ''}{item.points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
