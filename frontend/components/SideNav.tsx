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

export default function SideNav() {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <aside className="hidden md:flex flex-col w-60 lg:w-64 min-h-screen flex-shrink-0 sticky top-0 h-screen"
           style={{
             background: 'var(--bg)',
             borderRight: '1px solid var(--border)',
           }}>

      {/* Brand */}
      <div className="px-6 py-8 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl neo-btn-accent flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-base">P</span>
        </div>
        <div>
          <p className="font-bold text-sm tracking-tight" style={{ color: 'var(--fg)' }}>
            PopoloPizza
          </p>
          <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Rewards</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1.5">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium
                         transition-all duration-200
                         ${active ? 'neo-inset-sm' : 'hover:neo-sm'}`}
              style={{ color: active ? 'var(--accent)' : 'var(--fg-muted)' }}>
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4">
        <button
          onClick={() => { clearSession(); router.replace('/') }}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-sm font-medium
                     transition-all hover:neo-sm"
          style={{ color: 'var(--fg-muted)' }}>
          <LogOut size={18} strokeWidth={1.8} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
