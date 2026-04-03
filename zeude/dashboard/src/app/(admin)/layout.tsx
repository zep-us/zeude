import { requireAuth } from '@/lib/session'
import { AdminNav } from '@/components/admin/nav'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth()
  const user = session.user
  const isAdmin = user.role === 'admin'
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <img src="/Zep-logo-full.svg" alt="Zeude" className="h-8" />
          <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Admin</span>
        </div>

        <AdminNav isAdmin={isAdmin} />

        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">
                {user.name || user.email}
              </span>
              {user.name && (
                <span className="text-xs text-muted-foreground truncate">
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  )
}
