'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, History, BarChart3, LogOut, Users, Server, Trophy, Zap, Command } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/sessions', label: 'Sessions', icon: History },
  { href: '/daily', label: 'Daily Stats', icon: BarChart3 },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
]

const adminItems = [
  { href: '/admin/team', label: 'Team', icon: Users },
  { href: '/admin/mcp', label: 'MCP Servers', icon: Server },
  { href: '/admin/skills', label: 'Skills', icon: Command },
  { href: '/admin/hooks', label: 'Hooks', icon: Zap },
]

interface DashboardNavProps {
  isAdmin?: boolean
  basePath?: string
  showLogout?: boolean
  logoutAction?: string
  logoutHref?: string
  logoutLabel?: string
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return ''
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
}

function resolveHref(basePath: string, href: string): string {
  if (!basePath) return href
  if (href === '/') return basePath
  return `${basePath}${href}`
}

export function DashboardNav({
  isAdmin = false,
  basePath = '',
  showLogout = true,
  logoutAction = '/api/auth/logout',
  logoutHref,
  logoutLabel = 'Logout',
}: DashboardNavProps) {
  const pathname = usePathname()
  const normalizedBasePath = normalizeBasePath(basePath)

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const href = resolveHref(normalizedBasePath, item.href)
        const isActive = pathname === href
        return (
          <Link
            key={item.href}
            href={href}
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
      })}

      {isAdmin && (
        <>
          <div className="mt-4 mb-2 px-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Admin</span>
          </div>
          {adminItems.map((item) => {
            const href = resolveHref(normalizedBasePath, item.href)
            const isActive = pathname === href
            return (
              <Link
                key={item.href}
                href={href}
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
          })}
        </>
      )}

      {showLogout && (
        <div className="mt-auto pt-4 border-t">
          {logoutHref ? (
            <Link
              href={logoutHref}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {logoutLabel}
            </Link>
          ) : (
            <form action={logoutAction} method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {logoutLabel}
              </button>
            </form>
          )}
        </div>
      )}
    </nav>
  )
}
