'use client'

import { useState, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

import type { UserSourceUsage } from '@/lib/source-types'

interface SourceUserComparisonProps {
  data: UserSourceUsage[]
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  if (num % 1 !== 0) return num.toFixed(1)
  return num.toString()
}

function formatCurrency(num: number): string {
  return `$${num.toFixed(2)}`
}

type SortField = 'userName' | 'total' | 'claude' | 'codex' | 'cost'

export const SourceUserComparison = memo(function SourceUserComparison({ data }: SourceUserComparisonProps) {
  const [sortField, setSortField] = useState<SortField>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sorted = [...data].sort((a, b) => {
    let aVal: number | string, bVal: number | string
    switch (sortField) {
      case 'userName':
        aVal = a.userName; bVal = b.userName
        return sortDir === 'asc' ? (aVal as string).localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string)
      case 'claude':
        aVal = a.claude_inputTokens + a.claude_outputTokens
        bVal = b.claude_inputTokens + b.claude_outputTokens
        break
      case 'codex':
        aVal = a.codex_inputTokens + a.codex_outputTokens
        bVal = b.codex_inputTokens + b.codex_outputTokens
        break
      case 'cost':
        aVal = a.claude_cost + a.codex_cost
        bVal = b.claude_cost + b.codex_cost
        break
      default: // total
        aVal = a.claude_inputTokens + a.claude_outputTokens + a.codex_inputTokens + a.codex_outputTokens
        bVal = b.claude_inputTokens + b.claude_outputTokens + b.codex_inputTokens + b.codex_outputTokens
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  // Only show users with activity
  const activeUsers = sorted.filter((u) =>
    u.claude_inputTokens + u.claude_outputTokens + u.codex_inputTokens + u.codex_outputTokens > 0
  )

  // Detect which users use both tools
  const dualUsers = activeUsers.filter(
    (u) => (u.claude_inputTokens + u.claude_outputTokens > 0) && (u.codex_inputTokens + u.codex_outputTokens > 0)
  )

  function SortHeader({ field, children }: { field: SortField; children: React.ReactNode }) {
    const isActive = sortField === field
    return (
      <TableHead
        className="cursor-pointer hover:bg-muted/50 select-none text-center"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center justify-center gap-1">
          {children}
          {isActive && <span className="text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </div>
      </TableHead>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Per-User Source Comparison</CardTitle>
            <p className="text-sm text-muted-foreground">
              Side-by-side view of each developer&apos;s usage across Claude Code and Codex
            </p>
          </div>
          {dualUsers.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {dualUsers.length} dual-tool {dualUsers.length === 1 ? 'user' : 'users'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No comparison data available</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="userName">User</SortHeader>
                  {/* Claude Code columns */}
                  <TableHead colSpan={3} className="text-center border-l bg-blue-500/5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
                    Claude Code
                  </TableHead>
                  {/* Codex columns */}
                  <TableHead colSpan={3} className="text-center border-l bg-emerald-500/5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                    Codex
                  </TableHead>
                  <SortHeader field="cost">Total Cost</SortHeader>
                </TableRow>
                <TableRow>
                  <TableHead />
                  {/* Claude sub-headers */}
                  <SortHeader field="claude">Tokens</SortHeader>
                  <TableHead className="text-center text-xs">Requests</TableHead>
                  <TableHead className="text-center text-xs">Cost</TableHead>
                  {/* Codex sub-headers */}
                  <SortHeader field="codex">Tokens</SortHeader>
                  <TableHead className="text-center text-xs">Requests</TableHead>
                  <TableHead className="text-center text-xs">Cost</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.slice(0, 20).map((user) => {
                  const claudeTotal = user.claude_inputTokens + user.claude_outputTokens
                  const codexTotal = user.codex_inputTokens + user.codex_outputTokens
                  const isDual = claudeTotal > 0 && codexTotal > 0
                  const totalCost = user.claude_cost + user.codex_cost

                  return (
                    <TableRow key={user.userId} className={isDual ? 'bg-purple-500/5' : ''}>
                      <TableCell className="font-medium max-w-[150px] truncate" title={user.userName}>
                        <div className="flex items-center gap-1.5">
                          {isDual && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" title="Uses both tools" />
                          )}
                          {user.userName.length > 16 ? `${user.userName.slice(0, 16)}...` : user.userName}
                        </div>
                      </TableCell>
                      {/* Claude Code cells */}
                      <TableCell className="text-center font-mono text-sm border-l">
                        {claudeTotal > 0 ? (
                          <span className="text-blue-600">{formatNumber(claudeTotal)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {user.claude_requestCount > 0 ? user.claude_requestCount.toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {user.claude_cost > 0 ? formatCurrency(user.claude_cost) : '-'}
                      </TableCell>
                      {/* Codex cells */}
                      <TableCell className="text-center font-mono text-sm border-l">
                        {codexTotal > 0 ? (
                          <span className="text-emerald-600">{formatNumber(codexTotal)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {user.codex_requestCount > 0 ? user.codex_requestCount.toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {user.codex_cost > 0 ? formatCurrency(user.codex_cost) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-semibold">
                        {formatCurrency(totalCost)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
