import Image from 'next/image'
import { DashboardNav } from '@/components/dashboard/nav'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ChatWidgetWrapper } from '@/components/chat/chat-widget-wrapper'

const demoUser = {
  name: 'Demo User',
  email: 'demo@zeude.mock',
}

export default function DemoDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initials = demoUser.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <Image src="/Zep-logo-full.svg" alt="Zeude" width={132} height={32} className="h-8 w-auto" priority />
          <Badge variant="secondary">Mock</Badge>
        </div>

        <DashboardNav
          isAdmin
          basePath="/demo"
          showLogout
          logoutHref="/demo/landing"
          logoutLabel="Logout"
        />

        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{demoUser.name}</span>
              <span className="text-xs text-muted-foreground truncate">{demoUser.email}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">{children}</main>
      <ChatWidgetWrapper />
    </div>
  )
}
