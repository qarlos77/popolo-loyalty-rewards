import SideNav from './SideNav'

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SideNav />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}
