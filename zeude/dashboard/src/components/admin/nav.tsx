'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Users, Server, Bot, Command, Zap, BarChart3, ArrowLeft, LogOut } from 'lucide-react'

const workspaceItems = [
  { href: '/admin/hooks', label: 'Hooks', icon: Zap },
  { href: '/admin/mcp', label: 'MCP Servers', icon: Server },
  { href: '/admin/skills', label: 'Skills', icon: Command },
  { href: '/admin/agents', label: 'Agents', icon: Bot },
]

const adminItems = [
  { href: '/admin/team', label: 'Team Members', icon: Users },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
]

interface AdminNavProps {
  isAdmin: boolean
}

export function AdminNav({ isAdmin }: AdminNavProps) {
  const pathname = usePathname()

  const renderLink = (item: typeof workspaceItems[number], isActive: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  )

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="text-xs font-medium text-muted-foreground px-3 py-2">
        Workspace
      </div>
      {workspaceItems.map((item) => renderLink(item, pathname.startsWith(item.href)))}

      {isAdmin && (
        <>
          <div className="text-xs font-medium text-muted-foreground px-3 py-2 mt-2">
            Admin
          </div>
          {adminItems.map((item) => renderLink(item, pathname.startsWith(item.href)))}
        </>
      )}

      <div className="mt-auto pt-4 border-t">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </form>
      </div>
    </nav>
  )
}
