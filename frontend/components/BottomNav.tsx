'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Gift, Clock, LogOut } from 'lucide-react'
import { clearSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const tabs = [
  { href: '/dashboard', icon: Home,  label: 'Inicio'    },
  { href: '/rewards',   icon: Gift,  label: 'Premios'   },
  { href: '/history',   icon: Clock, label: 'Historial' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  function logout() {
    clearSession()
    router.replace('/')
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]
                    bg-brand-card/95 backdrop-blur-xl border-t border-white/10
                    flex items-center safe-area-pb z-50">
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors
              ${active ? 'text-brand-orange' : 'text-gray-500 active:text-gray-300'}`}>
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] font-semibold">{label}</span>
          </Link>
        )
      })}
      <button onClick={logout}
        className="flex-1 flex flex-col items-center py-3 gap-1 text-gray-500 active:text-red-400 transition-colors">
        <LogOut size={22} strokeWidth={1.8} />
        <span className="text-[10px] font-semibold">Salir</span>
      </button>
    </nav>
  )
}
