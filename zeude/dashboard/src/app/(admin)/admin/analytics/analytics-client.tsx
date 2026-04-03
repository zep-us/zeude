'use client'

import { useState, useMemo, lazy, Suspense } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TrendingUp, Zap, DollarSign, Database, RefreshCw, Wrench, Wand2, Users, GitCompareArrows } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'

import {
  useAnalyticsOverview,
  useUserUsage,
  useUserInsights,
  useRegisterCohort,
} from '@/hooks/use-analytics'
import type {
  UsageSummary,
  UserUsage,
  TrendPoint,
  UsagePagination,
  CohortRegisterResult,
  UserEfficiency,
  UserInsights,
  SkillData,
} from '@/hooks/use-analytics'
import type { SourceBreakdown, SourceTrendPoint, UserSourceUsage } from '@/lib/source-types'

const SourceComparisonChart = lazy(() => import('@/components/charts/source-comparison-chart').then(m => ({ default: m.SourceComparisonChart })))
const SourceSummaryComparison = lazy(() => import('@/components/charts/source-comparison-chart').then(m => ({ default: m.SourceSummaryComparison })))
const SourceUserComparison = lazy(() => import('@/components/charts/source-user-comparison').then(m => ({ default: m.SourceUserComparison })))

type Period = '7d' | '30d' | '90d'
type SourceFilter = 'all' | 'claude' | 'codex'
type SortField = 'userName' | 'cacheHitRate' | 'contextGrowthRate' | 'retryDensity' | 'avgInputPerRequest' | 'efficiencyScore'

const SOURCE_DOT_COLORS: Record<string, string> = {
  claude: 'bg-blue-500',
  codex: 'bg-emerald-500',
}
const SOURCE_DOT_COLORS_DEFAULT = 'bg-gray-400'

const SOURCE_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

const TOOL_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  if (num % 1 !== 0) return num.toFixed(1)
  return num.toString()
}

function formatCurrency(num: number): string {
  return `$${num.toFixed(2)}`
}

function normalizeRatio(num: number): number {
  return num > 1 ? num / 100 : num
}

function formatPercent(num: number): string {
  const percent = num > 1 ? num : num * 100
  return `${Math.round(percent)}%`
}

function getEfficiencyBadge(score: number) {
  if (score >= 80) return <Badge className="bg-green-500">Excellent</Badge>
  if (score >= 60) return <Badge className="bg-yellow-500">Good</Badge>
  if (score >= 40) return <Badge className="bg-orange-500">Needs Review</Badge>
  return <Badge variant="destructive">Poor</Badge>
}

function getCacheRateColor(rate: number): string {
  const normalized = normalizeRatio(rate)
  if (normalized >= 0.85) return 'text-green-600'
  if (normalized >= 0.60) return 'text-yellow-600'
  return 'text-red-600'
}

function SortHeader({ field, sortField, sortDirection, onToggle, children }: {
  field: SortField
  sortField: SortField
  sortDirection: 'asc' | 'desc'
  onToggle: (field: SortField) => void
  children: React.ReactNode
}) {
  const isActive = sortField === field
  return (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => onToggle(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive && (
          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </TableHead>
  )
}

const ChartSkeleton = () => <div className="h-[300px] bg-muted animate-pulse rounded-lg" />

export default function AnalyticsClient() {
  const [period, setPeriod] = useState<Period>('7d')
  const [source, setSource] = useState<SourceFilter>('all')
  const [compareMode, setCompareMode] = useState(false)
  const [userSearchInput, setUserSearchInput] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [cohortKey, setCohortKey] = useState('hackathon-20260305')
  const [cohortResult, setCohortResult] = useState<CohortRegisterResult | null>(null)

  // Efficiency sorting
  const [sortField, setSortField] = useState<SortField>('efficiencyScore')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // User insights modal
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // React Query hooks
  const overviewQuery = useAnalyticsOverview(period, source, compareMode)
  const userUsageQuery = useUserUsage(period, userPage, userQuery)
  const insightsQuery = useUserInsights(selectedUserId, source)
  const registerCohort = useRegisterCohort()

  // Derive data from queries
  const loading = overviewQuery.isLoading
  const userUsageLoading = userUsageQuery.isLoading
  const summary = overviewQuery.data?.usageData?.summary ?? null
  const trend = overviewQuery.data?.usageData?.trend ?? []
  const sourceBreakdown = overviewQuery.data?.usageData?.sourceBreakdown ?? []
  const trendBySource = overviewQuery.data?.usageData?.trendBySource ?? []
  const byUserBySource = overviewQuery.data?.usageData?.byUserBySource ?? []
  const efficiency = overviewQuery.data?.efficiencyData?.byUser ?? []
  const skillData = overviewQuery.data?.skillsData ?? null
  const userUsage = userUsageQuery.data?.byUser ?? []
  const usagePagination = userUsageQuery.data?.pagination ?? { page: 1, pageSize: 50, totalUsers: 0, totalPages: 1, search: '' }
  const insights = insightsQuery.data ?? null
  const insightsLoading = insightsQuery.isLoading

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedEfficiency = useMemo(() =>
    [...efficiency].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    }),
    [efficiency, sortField, sortDirection]
  )

  function openUserInsights(userId: string) {
    setSelectedUserId(userId)
    setInsightsOpen(true)
  }

  const selectedUser = efficiency.find(u => u.userId === selectedUserId)

  const handleSearchSubmit = () => {
    const nextQuery = userSearchInput.trim()
    if (nextQuery === userQuery && userPage === 1) {
      userUsageQuery.refetch()
      return
    }
    setUserPage(1)
    setUserQuery(nextQuery)
  }

  const handleRefresh = () => {
    overviewQuery.refetch()
    userUsageQuery.refetch()
  }

  const handleRegisterCohort = async () => {
    const key = cohortKey.trim()
    if (!key) return
    setCohortResult(null)
    try {
      const result = await registerCohort.mutateAsync(key)
      setCohortResult(result)
    } catch (error) {
      console.error('Failed to register cohort:', error)
    }
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Token Analytics</h1>
          <p className="text-muted-foreground">
            Monitor token usage and efficiency across your team (Claude Code &amp; Codex)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              compareMode
                ? 'bg-purple-600 text-white border-purple-600'
                : 'hover:bg-muted border-border'
            }`}
            title="Toggle side-by-side comparison of Claude Code vs Codex"
          >
            <GitCompareArrows className="h-4 w-4" />
            Compare
          </button>
          <div className="flex border rounded-lg">
            {(['all', 'claude', 'codex'] as SourceFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1.5 text-sm transition-colors ${source === s
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-muted'
                  }`}
              >
                {s === 'all' ? 'All Sources' : s === 'claude' ? 'Claude Code' : 'Codex'}
              </button>
            ))}
          </div>
          <div className="flex border rounded-lg">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p)
                  setUserPage(1)
                }}
                className={`px-3 py-1.5 text-sm transition-colors ${period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
                  }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={overviewQuery.isFetching || userUsageQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching || userUsageQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatNumber(summary.totalInputTokens) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'Last 90 days'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatNumber(summary.totalOutputTokens) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.totalRequests.toLocaleString()} requests` : '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.totalCost) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated based on model pricing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary ? getCacheRateColor(summary.cacheHitRate) : ''}`}>
              {summary ? formatPercent(summary.cacheHitRate) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Target: &gt;85%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Source Comparison: Claude Code vs Codex */}
      {sourceBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source Comparison: Claude Code vs Codex</CardTitle>
            <p className="text-sm text-muted-foreground">
              Side-by-side comparison of usage across AI coding tools
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Input Tokens by source */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Input Tokens</div>
                {sourceBreakdown.map((sb) => (
                  <div key={`input-${sb.source}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT}`} />
                      <span className="text-sm capitalize">{sb.source || 'unknown'}</span>
                    </div>
                    <span className="font-mono text-sm">{formatNumber(sb.inputTokens)}</span>
                  </div>
                ))}
              </div>

              {/* Output Tokens by source */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Output Tokens</div>
                {sourceBreakdown.map((sb) => (
                  <div key={`output-${sb.source}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT}`} />
                      <span className="text-sm capitalize">{sb.source || 'unknown'}</span>
                    </div>
                    <span className="font-mono text-sm">{formatNumber(sb.outputTokens)}</span>
                  </div>
                ))}
              </div>

              {/* Cost by source */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Cost</div>
                {sourceBreakdown.map((sb) => (
                  <div key={`cost-${sb.source}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT}`} />
                      <span className="text-sm capitalize">{sb.source || 'unknown'}</span>
                    </div>
                    <span className="font-mono text-sm">{formatCurrency(sb.cost)}</span>
                  </div>
                ))}
              </div>

              {/* Requests by source */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Requests</div>
                {sourceBreakdown.map((sb) => (
                  <div key={`req-${sb.source}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT}`} />
                      <span className="text-sm capitalize">{sb.source || 'unknown'}</span>
                    </div>
                    <span className="font-mono text-sm">{sb.requestCount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual proportion bars */}
            {(() => {
              const totalTokens = sourceBreakdown.reduce((sum, sb) => sum + sb.inputTokens + sb.outputTokens, 0)
              if (totalTokens === 0) return null
              return (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Token Distribution</div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                    {sourceBreakdown.map((sb) => {
                      const pct = ((sb.inputTokens + sb.outputTokens) / totalTokens) * 100
                      if (pct === 0) return null
                      return (
                        <div
                          key={`bar-${sb.source}`}
                          className={`${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT} transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${sb.source}: ${pct.toFixed(1)}%`}
                        />
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    {sourceBreakdown.map((sb) => {
                      const pct = ((sb.inputTokens + sb.outputTokens) / totalTokens) * 100
                      return (
                        <span key={`label-${sb.source}`} className="text-xs text-muted-foreground">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${SOURCE_DOT_COLORS[sb.source] ?? SOURCE_DOT_COLORS_DEFAULT}`} />
                          {SOURCE_LABELS[sb.source] ?? sb.source} {pct.toFixed(1)}%
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {/* Comparison Mode: Overlay Charts + Split Table */}
      {compareMode && (
        <div className="space-y-6">
          {loading ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">Loading comparison data...</div>
              </CardContent>
            </Card>
          ) : trendBySource.length > 0 ? (
            <Suspense fallback={<ChartSkeleton />}>
              {/* Summary Comparison */}
              <SourceSummaryComparison data={trendBySource} />

              {/* Overlay Charts: Token + Cost side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SourceComparisonChart data={trendBySource} metric="tokens" />
                <SourceComparisonChart data={trendBySource} metric="cost" />
              </div>

              {/* Per-User Source Comparison Table */}
              {byUserBySource.length > 0 && (
                <SourceUserComparison data={byUserBySource} />
              )}
            </Suspense>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  No comparison data available. Both Claude Code and Codex need usage data to compare.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Usage Trend Chart (Simplified) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : trend.length > 0 ? (
            <div className="h-32 flex items-end gap-1">
              {trend.slice(-14).map((point, i) => {
                const maxInput = Math.max(...trend.slice(-14).map(t => t.inputTokens))
                const height = (point.inputTokens / maxInput) * 100
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t"
                    style={{ height: `${height}%` }}
                    title={`${point.date}: ${formatNumber(point.inputTokens)} tokens`}
                  />
                )
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cohort Registration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cohort Registration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              className="md:max-w-sm"
              placeholder="cohort key (e.g. hackathon-20260305)"
              value={cohortKey}
              onChange={(e) => setCohortKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRegisterCohort()
                }
              }}
            />
            <Button onClick={handleRegisterCohort} disabled={registerCohort.isPending || !cohortKey.trim()}>
              {registerCohort.isPending ? 'Registering...' : 'Register Current Active Members'}
            </Button>
          </div>

          {cohortResult && (
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <p>
                Cohort <span className="font-mono">{cohortResult.cohortKey}</span>:
                processed {cohortResult.processedUsers}, inserted {cohortResult.insertedMembers}, total {cohortResult.totalMembers}
              </p>
              <Link href={cohortResult.leaderboardUrl} className="text-primary underline">
                Open Cohort Leaderboard
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Users Token Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            All Users Token Dashboard
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            전체 사용자 기준 토큰 사용량 (상위 10명 제한 없음)
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 md:max-w-lg">
              <Input
                placeholder="Search user by name or id"
                value={userSearchInput}
                onChange={e => setUserSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSearchSubmit()
                  }
                }}
              />
              <Button variant="outline" onClick={handleSearchSubmit}>Search</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {userUsage.length} / {usagePagination.totalUsers} users
            </p>
          </div>

          {userUsageLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : userUsage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No user usage data available</div>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">#</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Total Tokens</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cache Read</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Cache Hit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userUsage.map((user, index) => {
                    const totalTokens = user.inputTokens + user.outputTokens + user.cacheReadTokens
                    return (
                      <TableRow
                        key={user.userId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openUserInsights(user.userId)}
                      >
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {(usagePagination.page - 1) * usagePagination.pageSize + index + 1}
                        </TableCell>
                        <TableCell className="font-medium max-w-[220px] truncate" title={user.userName}>
                          {user.userName}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(totalTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(user.inputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(user.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(user.cacheReadTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {user.requestCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(user.cost)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${getCacheRateColor(user.cacheHitRate)}`}>
                          {formatPercent(user.cacheHitRate)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {usagePagination.page} / {usagePagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserPage(prev => Math.max(1, prev - 1))}
                disabled={userUsageLoading || usagePagination.page <= 1}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserPage(prev => Math.min(usagePagination.totalPages, prev + 1))}
                disabled={userUsageLoading || usagePagination.page >= usagePagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Efficiency Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Efficiency Comparison
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click column headers to sort • Compare team efficiency metrics
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : sortedEfficiency.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No efficiency data available</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="userName" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>User</SortHeader>
                  <SortHeader field="cacheHitRate" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>
                    <span className="hidden sm:inline">Cache Hit Rate</span>
                    <span className="sm:hidden">Cache</span>
                  </SortHeader>
                  <SortHeader field="contextGrowthRate" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>
                    <span className="hidden sm:inline">Context Growth</span>
                    <span className="sm:hidden">Growth</span>
                  </SortHeader>
                  <SortHeader field="retryDensity" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>
                    <span className="hidden sm:inline">Retry Density</span>
                    <span className="sm:hidden">Retry</span>
                  </SortHeader>
                  <SortHeader field="avgInputPerRequest" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>
                    <span className="hidden sm:inline">Avg Input/Req</span>
                    <span className="sm:hidden">Avg In</span>
                  </SortHeader>
                  <SortHeader field="efficiencyScore" sortField={sortField} sortDirection={sortDirection} onToggle={toggleSort}>Score</SortHeader>
                  <TableHead className="text-center hidden lg:table-cell">Score Breakdown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEfficiency.map((user) => (
                  <TableRow
                    key={user.userId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openUserInsights(user.userId)}
                  >
                    <TableCell className="font-medium max-w-[120px] truncate" title={user.userName}>
                      {user.userName.length > 12 ? `${user.userName.slice(0, 12)}...` : user.userName}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${getCacheRateColor(user.cacheHitRate)}`}>
                      {formatPercent(user.cacheHitRate)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${user.contextGrowthRate <= 2 ? 'text-green-600' : user.contextGrowthRate <= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {user.contextGrowthRate.toFixed(1)}x
                    </TableCell>
                    <TableCell className={`text-right font-mono ${normalizeRatio(user.retryDensity) <= 0.10 ? 'text-green-600' : normalizeRatio(user.retryDensity) <= 0.20 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {formatPercent(user.retryDensity)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${user.avgInputPerRequest <= 20000 ? 'text-green-600' : user.avgInputPerRequest <= 50000 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {formatNumber(user.avgInputPerRequest)}
                    </TableCell>
                    <TableCell className="text-center">
                      <UITooltip>
                        <TooltipTrigger>
                          {getEfficiencyBadge(user.efficiencyScore)}
                        </TooltipTrigger>
                        <TooltipContent className="lg:hidden">
                          <div className="text-xs space-y-1">
                            <div>비용 효율: {Math.round((user.costEfficiency || 0) * 100)}%</div>
                            <div>작업 품질: {Math.round((user.workQuality || 0) * 100)}%</div>
                            <div>컨텍스트 규율: {Math.round((user.contextEfficiency || 0) * 100)}%</div>
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-2 justify-center">
                        <UITooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className={`text-xs ${(user.costEfficiency || 0) >= 0.8 ? 'border-green-500 text-green-600' : (user.costEfficiency || 0) >= 0.5 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600'}`}>
                              💰 {Math.round((user.costEfficiency || 0) * 100)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>비용 효율성 (output/cost)</TooltipContent>
                        </UITooltip>
                        <UITooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className={`text-xs ${(user.workQuality || 0) >= 0.9 ? 'border-green-500 text-green-600' : (user.workQuality || 0) >= 0.8 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600'}`}>
                              ✅ {Math.round((user.workQuality || 0) * 100)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>작업 품질 (1 - retry)</TooltipContent>
                        </UITooltip>
                        <UITooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className={`text-xs ${(user.contextEfficiency || 0) >= 0.5 ? 'border-green-500 text-green-600' : (user.contextEfficiency || 0) >= 0.2 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600'}`}>
                              📦 {Math.round((user.contextEfficiency || 0) * 100)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>컨텍스트 규율 (1 / growth)</TooltipContent>
                        </UITooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Skill Usage Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Skill Adoption */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Skill Adoption
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Workflow usage across team
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 bg-muted animate-pulse rounded-lg" />
            ) : skillData?.adoptionRate ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600">
                    {skillData.adoptionRate.adoption_rate}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {skillData.adoptionRate.skill_users} of {skillData.adoptionRate.total_users} users
                  </p>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all"
                    style={{ width: `${skillData.adoptionRate.adoption_rate}%` }}
                  />
                </div>
                {skillData.promptTypeStats && skillData.promptTypeStats.length > 0 && (
                  <div className="pt-4 border-t space-y-2">
                    {skillData.promptTypeStats.map((stat) => (
                      <div key={stat.prompt_type} className="flex justify-between text-sm">
                        <span className="capitalize text-muted-foreground">
                          {stat.prompt_type === 'natural' ? 'Natural Language' : stat.prompt_type}
                        </span>
                        <span className="font-mono">
                          {stat.count.toLocaleString()} ({stat.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No skill data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Skills */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-500" />
              Top Skills & Commands
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Most frequently used workflows
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : skillData?.topSkills && skillData.topSkills.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill / Command</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skillData.topSkills.slice(0, 10).map((skill, index) => (
                    <TableRow key={skill.invoked_name}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 text-center text-xs font-bold ${
                            index === 0 ? 'text-yellow-500' :
                            index === 1 ? 'text-gray-400' :
                            index === 2 ? 'text-amber-600' : 'text-muted-foreground'
                          }`}>
                            {index + 1}
                          </span>
                          <code className="text-purple-600">/{skill.invoked_name}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {skill.count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm hidden sm:table-cell">
                        {new Date(skill.last_used).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No skill usage data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Insights Modal */}
      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              User Insights
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.userName && selectedUser.userName.length > 30
                ? `${selectedUser.userName.slice(0, 30)}...`
                : selectedUser?.userName}
            </DialogDescription>
          </DialogHeader>

          {insightsLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading insights...
            </div>
          ) : insights ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{insights.sessionStats.totalSessions}</div>
                    <div className="text-xs text-muted-foreground">Total Sessions (30d)</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{insights.sessionStats.avgSessionLength.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Avg Requests/Session</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{insights.sessionStats.avgGrowthRate.toFixed(1)}x</div>
                    <div className="text-xs text-muted-foreground">Avg Context Growth</div>
                  </CardContent>
                </Card>
              </div>

              {/* Context Growth Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Context Growth Over Time
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    How context size grows during sessions (lower is better)
                  </p>
                </CardHeader>
                <CardContent>
                  {insights.contextGrowth.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={insights.contextGrowth}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => v.slice(5)}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          domain={[0, 'auto']}
                          tickFormatter={(v) => `${v}x`}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                          formatter={(value) => [`${(value as number)?.toFixed(2) ?? 0}x`, 'Growth Rate']}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgGrowthRate"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No context growth data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tool Usage Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Tool Usage
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Most frequently used tools in the last 30 days
                  </p>
                </CardHeader>
                <CardContent>
                  {insights.toolUsage.length > 0 ? (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={insights.toolUsage} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis
                            type="category"
                            dataKey="tool"
                            tick={{ fontSize: 10 }}
                            width={80}
                          />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                            formatter={(value, name) => {
                              const v = value as number ?? 0;
                              return [
                                name === 'requests' ? v.toLocaleString() : formatNumber(v),
                                name === 'requests' ? 'Requests' : name === 'inputTokens' ? 'Input Tokens' : 'Output Tokens'
                              ];
                            }}
                          />
                          <Bar dataKey="requests" name="requests">
                            {insights.toolUsage.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={TOOL_COLORS[index % TOOL_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Tool details table */}
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tool</TableHead>
                              <TableHead className="text-right">Requests</TableHead>
                              <TableHead className="text-right">Input Tokens</TableHead>
                              <TableHead className="text-right">Output Tokens</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insights.toolUsage.map((tool, i) => (
                              <TableRow key={tool.tool}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: TOOL_COLORS[i % TOOL_COLORS.length] }}
                                    />
                                    {tool.tool}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {tool.requests.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatNumber(tool.inputTokens)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatNumber(tool.outputTokens)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No tool usage data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Improvement Tips */}
              {selectedUser?.tips && selectedUser.tips.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Improvement Tips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedUser.tips.map((tip, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-yellow-500 mt-0.5">→</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              Failed to load insights
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}
