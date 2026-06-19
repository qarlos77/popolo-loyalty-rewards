'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Gift, Clock, LogOut } from 'lucide-react'
import { clearSession } from '@/lib/auth'

const tabs = [
  { href: '/dashboard', icon: Home,  label: 'Inicio'    },
  { href: '/rewards',   icon: Gift,  label: 'Premios'   },
  { href: '/history',   icon: Clock, label: 'Historial' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center px-2 pb-safe"
         style={{
           background: 'var(--bg)',
           boxShadow: '-2px -2px 8px var(--sh-dark), 2px -2px 8px var(--sh-light)',
         }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href}
            className="flex-1 flex flex-col items-center py-3 gap-1 transition-colors rounded-xl mx-1">
            <div className={`p-2 rounded-xl transition-all ${active ? 'neo-inset-sm' : ''}`}>
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                style={{ color: active ? 'var(--accent)' : 'var(--fg-muted)' }}
              />
            </div>
            <span className="text-[10px] font-semibold"
                  style={{ color: active ? 'var(--accent)' : 'var(--fg-subtle)' }}>
              {label}
            </span>
          </Link>
        )
      })}
      <button
        onClick={() => { clearSession(); router.replace('/') }}
        className="flex-1 flex flex-col items-center py-3 gap-1 rounded-xl mx-1 transition-colors">
        <div className="p-2 rounded-xl">
          <LogOut size={20} strokeWidth={1.8} style={{ color: 'var(--fg-muted)' }} />
        </div>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--fg-subtle)' }}>
          Salir
        </span>
      </button>
    </nav>
  )
}
