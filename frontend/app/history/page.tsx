'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { odoo } from '@/lib/odoo'
import { getSession } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import PageShell from '@/components/PageShell'
import type { HistoryItem } from '@/lib/types'

export default function HistoryPage() {
  const router  = useRouter()
  const [items, setItems]   = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/'); return }
    odoo.history(session.token, 50)
      .then(r => setItems(r.history))
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))
  }, [router])

  const earned = items.filter(h => h.type === 'earned').reduce((s, h) => s + h.points, 0)
  const spent  = items.filter(h => h.type === 'redeemed').reduce((s, h) => s + Math.abs(h.points), 0)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
    </div>
  )

  return (
    <PageShell>
      <div className="min-h-screen pb-24 md:pb-10">

        {/* Header */}
        <div className="px-5 pt-12 md:pt-8 pb-6 max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider"
             style={{ color: 'var(--fg-muted)' }}>
            Movimientos
          </p>
          <h1 className="text-xl font-bold tracking-tight mt-0.5" style={{ color: 'var(--fg)' }}>
            Historial
          </h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-5 space-y-5">

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="neo-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg neo-inset-sm flex items-center justify-center">
                  <TrendingUp size={13} style={{ color: '#4ade80' }} />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'var(--fg-muted)' }}>
                  Ganados
                </p>
              </div>
              <p className="text-2xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>
                +{earned.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>puntos totales</p>
            </div>
            <div className="neo-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg neo-inset-sm flex items-center justify-center">
                  <TrendingDown size={13} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="text-xs font-medium uppercase tracking-wider"
                   style={{ color: 'var(--fg-muted)' }}>
                  Canjeados
                </p>
              </div>
              <p className="text-2xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>
                -{spent.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-subtle)' }}>puntos usados</p>
            </div>
          </div>

          {/* Timeline */}
          {items.length === 0 ? (
            <div className="neo rounded-3xl py-16 text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                Sin movimientos aún
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
                Tus compras y canjes aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="neo rounded-2.5xl divide-y" style={{ borderColor: 'var(--border)' }}>
              {items.map((item, idx) => {
                const date     = new Date(item.date)
                const prevDate = idx > 0 ? new Date(items[idx - 1].date) : null
                const showDate = !prevDate || date.toDateString() !== prevDate.toDateString()

                return (
                  <div key={item.id}>
                    {showDate && (
                      <div className="px-5 pt-4 pb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest"
                           style={{ color: 'var(--fg-subtle)' }}>
                          {date.toLocaleDateString('es-PE',
                            { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 px-5 py-3">
                      <div className="w-8 h-8 rounded-xl neo-inset-sm flex items-center justify-center flex-shrink-0">
                        {item.type === 'earned'
                          ? <TrendingUp  size={14} style={{ color: '#4ade80' }} />
                          : <TrendingDown size={14} style={{ color: 'var(--accent)' }} />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--fg)' }}>
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px]" style={{ color: 'var(--fg-subtle)' }}>
                            {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {item.state === 'pending' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                             neo-inset-sm" style={{ color: 'var(--fg-muted)' }}>
                              pendiente
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-sm font-bold flex-shrink-0"
                         style={{ color: item.points >= 0 ? '#4ade80' : 'var(--accent)' }}>
                        {item.points >= 0 ? '+' : ''}
                        {item.points.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </PageShell>
  )
}
