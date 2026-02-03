'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { TrendingUp, Zap, DollarSign, Database, RefreshCw, Wrench, Wand2, Users } from 'lucide-react'
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

interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  cacheHitRate: number
  totalRequests: number
}

interface UserUsage {
  userId: string
  userName: string
  team: string
  inputTokens: number
  outputTokens: number
  cost: number
  cacheHitRate: number
  requestCount: number
}

interface TrendPoint {
  date: string
  inputTokens: number
  outputTokens: number
  cost: number
}

interface UserEfficiency {
  userId: string
  userName: string
  cacheHitRate: number
  avgInputPerRequest: number
  contextGrowthRate: number
  retryDensity: number
  efficiencyScore: number
  costEfficiency?: number
  workQuality?: number
  contextEfficiency?: number
  tips: string[]
}

interface ContextGrowthPoint {
  date: string
  sessionCount: number
  avgGrowthRate: number
  avgSessionLength: number
}

interface ToolUsage {
  tool: string
  requests: number
  inputTokens: number
  outputTokens: number
}

interface UserInsights {
  userId: string
  contextGrowth: ContextGrowthPoint[]
  toolUsage: ToolUsage[]
  sessionStats: {
    totalSessions: number
    avgSessionLength: number
    avgGrowthRate: number
  }
}

interface PromptTypeStats {
  prompt_type: string
  count: number
  percentage: number
}

interface SkillUsage {
  invoked_name: string
  count: number
  last_used: string
}

interface SkillData {
  promptTypeStats: PromptTypeStats[]
  topSkills: SkillUsage[]
  adoptionRate: {
    total_users: number
    skill_users: number
    adoption_rate: number
  }
}

type Period = '7d' | '30d' | '90d'

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [userUsage, setUserUsage] = useState<UserUsage[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [efficiency, setEfficiency] = useState<UserEfficiency[]>([])
  const [skillData, setSkillData] = useState<SkillData | null>(null)

  // Efficiency sorting
  type SortField = 'userName' | 'cacheHitRate' | 'contextGrowthRate' | 'retryDensity' | 'avgInputPerRequest' | 'efficiencyScore'
  const [sortField, setSortField] = useState<SortField>('efficiencyScore')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // User insights modal
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [insights, setInsights] = useState<UserInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
      const [usageRes, efficiencyRes, skillsRes] = await Promise.all([
        fetch(`/api/admin/analytics/usage?period=${period}`),
        fetch('/api/admin/analytics/efficiency'),
        fetch(`/api/admin/analytics/skills?days=${days}`),
      ])

      const usageData = await usageRes.json()
      const efficiencyData = await efficiencyRes.json()

      if (usageRes.ok) {
        setSummary(usageData.summary)
        setUserUsage(usageData.byUser)
        setTrend(usageData.trend)
      }

      if (efficiencyRes.ok) {
        setEfficiency(efficiencyData.byUser)
      }

      if (skillsRes.ok) {
        const skillsData = await skillsRes.json()
        setSkillData(skillsData)
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    if (num % 1 !== 0) return num.toFixed(1)
    return num.toString()
  }

  function formatCurrency(num: number): string {
    return `$${num.toFixed(2)}`
  }

  // Normalize to ratio (0-1) from either ratio or percentage format
  function normalizeRatio(num: number): number {
    return num > 1 ? num / 100 : num
  }

  function formatPercent(num: number): string {
    // Handle both ratio (0-1) and percentage (0-100) values
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

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedEfficiency = [...efficiency].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  async function openUserInsights(userId: string) {
    setSelectedUserId(userId)
    setInsightsOpen(true)
    setInsightsLoading(true)
    setInsights(null)

    try {
      const res = await fetch(`/api/admin/analytics/efficiency/${userId}`)
      if (res.ok) {
        const data = await res.json()
        setInsights(data)
      }
    } catch (error) {
      console.error('Failed to fetch user insights:', error)
    } finally {
      setInsightsLoading(false)
    }
  }

  const selectedUser = efficiency.find(u => u.userId === selectedUserId)

  // Colors for tool usage chart
  const TOOL_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

  function SortHeader({ field, children }: { field: typeof sortField; children: React.ReactNode }) {
    const isActive = sortField === field
    return (
      <TableHead
        className="cursor-pointer hover:bg-muted/50 select-none"
        onClick={() => toggleSort(field)}
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

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Token Analytics</h1>
          <p className="text-muted-foreground">
            Monitor token usage and efficiency across your team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm transition-colors ${period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
                  }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
                  <SortHeader field="userName">User</SortHeader>
                  <SortHeader field="cacheHitRate">
                    <span className="hidden sm:inline">Cache Hit Rate</span>
                    <span className="sm:hidden">Cache</span>
                  </SortHeader>
                  <SortHeader field="contextGrowthRate">
                    <span className="hidden sm:inline">Context Growth</span>
                    <span className="sm:hidden">Growth</span>
                  </SortHeader>
                  <SortHeader field="retryDensity">
                    <span className="hidden sm:inline">Retry Density</span>
                    <span className="sm:hidden">Retry</span>
                  </SortHeader>
                  <SortHeader field="avgInputPerRequest">
                    <span className="hidden sm:inline">Avg Input/Req</span>
                    <span className="sm:hidden">Avg In</span>
                  </SortHeader>
                  <SortHeader field="efficiencyScore">Score</SortHeader>
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

