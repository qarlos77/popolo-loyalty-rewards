'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import type { HistoryItem } from '@/lib/types'

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/'); return }
    odoo.history(session.token, 50)
      .then(r => setHistory(r.history))
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))
  }, [router])

  const earned = history.filter(h => h.type === 'earned').reduce((s, h) => s + h.points, 0)
  const spent  = history.filter(h => h.type === 'redeemed').reduce((s, h) => s + Math.abs(h.points), 0)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={36} className="animate-spin text-brand-orange" />
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-dark pb-28">
      <div className="px-5 pt-12 pb-4">
        <h1 className="text-white font-bold text-2xl">Historial 📊</h1>
        <p className="text-gray-400 text-sm mt-1">Todos tus movimientos de puntos</p>
      </div>

      {/* Summary cards */}
      <div className="px-4 mb-6 grid grid-cols-2 gap-3">
        <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-green-400" />
            <p className="text-green-400 text-xs uppercase tracking-wide">Ganados</p>
          </div>
          <p className="text-white font-bold text-2xl">
            +{earned.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-green-400/60 text-xs">puntos totales</p>
        </div>
        <div className="bg-orange-900/30 border border-orange-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={16} className="text-brand-orange" />
            <p className="text-brand-orange text-xs uppercase tracking-wide">Canjeados</p>
          </div>
          <p className="text-white font-bold text-2xl">
            -{spent.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-brand-orange/60 text-xs">puntos usados</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 space-y-2">
        {history.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-white font-semibold">Sin movimientos aún</p>
            <p className="text-gray-400 text-sm mt-2">
              Tus compras y canjes aparecerán aquí
            </p>
          </div>
        ) : history.map((item, idx) => {
          const prev = history[idx - 1]
          const date = new Date(item.date)
          const prevDate = prev ? new Date(prev.date) : null
          const showDate = !prevDate ||
            date.toDateString() !== prevDate.toDateString()

          return (
            <div key={item.id}>
              {showDate && (
                <p className="text-gray-500 text-xs uppercase tracking-wider px-1 pt-4 pb-2">
                  {date.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'long' })}
                </p>
              )}
              <div className="flex items-center gap-3 bg-brand-card border border-white/5
                              rounded-2xl px-4 py-3.5">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0
                  ${item.type === 'earned' ? 'bg-green-500/15' : 'bg-brand-orange/15'}`}>
                  {item.type === 'earned' ? '🛍️' : '🎁'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-gray-500 text-xs">
                      {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {item.code && (
                      <span className="text-gray-600 font-mono text-xs">#{item.code}</span>
                    )}
                    {item.state === 'confirmed' && item.type === 'redeemed' && (
                      <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                        Confirmado
                      </span>
                    )}
                    {item.state === 'pending' && (
                      <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>

                {/* Points */}
                <p className={`font-bold text-base flex-shrink-0
                  ${item.points >= 0 ? 'text-green-400' : 'text-brand-orange'}`}>
                  {item.points >= 0 ? '+' : ''}
                  {item.points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <BottomNav />
    </div>
  )
}
