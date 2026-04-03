'use client'

import { Fragment, memo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Colors: Claude Code = blue, Codex = emerald
const CLAUDE_COLOR = '#3b82f6'
const CODEX_COLOR = '#10b981'
const CLAUDE_COLOR_LIGHT = '#93c5fd'
const CODEX_COLOR_LIGHT = '#6ee7b7'

import type { SourceTrendPoint } from '@/lib/source-types'

interface SourceComparisonChartProps {
  data: SourceTrendPoint[]
  metric: 'tokens' | 'cost'
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return num.toString()
}

export const SourceComparisonChart = memo(function SourceComparisonChart({ data, metric }: SourceComparisonChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    date: d.date.slice(5), // MM-DD
  }))

  if (metric === 'cost') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cost Comparison (Overlay)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Daily cost: <span className="text-blue-500 font-medium">Claude Code</span> vs <span className="text-emerald-500 font-medium">Codex</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  formatter={(value, name) => {
                    const label = name === 'claude_cost' ? 'Claude Code' : 'Codex'
                    return [`$${Number(value).toFixed(4)}`, label]
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend
                  formatter={(value) => value === 'claude_cost' ? 'Claude Code' : 'Codex'}
                />
                <Line
                  type="monotone"
                  dataKey="claude_cost"
                  stroke={CLAUDE_COLOR}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="codex_cost"
                  stroke={CODEX_COLOR}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Tokens: stacked bar chart with side-by-side grouping
  const tokenData = chartData.map((d) => ({
    date: d.date,
    claude_input: d.claude_inputTokens,
    claude_output: d.claude_outputTokens,
    codex_input: d.codex_inputTokens,
    codex_output: d.codex_outputTokens,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Token Usage Comparison (Overlay)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Daily tokens: <span className="text-blue-500 font-medium">Claude Code</span> vs <span className="text-emerald-500 font-medium">Codex</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tokenData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    claude_input: 'Claude Input',
                    claude_output: 'Claude Output',
                    codex_input: 'Codex Input',
                    codex_output: 'Codex Output',
                  }
                  return [formatNumber(Number(value)), labels[String(name)] || String(name)]
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    claude_input: 'Claude Input',
                    claude_output: 'Claude Output',
                    codex_input: 'Codex Input',
                    codex_output: 'Codex Output',
                  }
                  return labels[value] || value
                }}
              />
              <Bar dataKey="claude_input" stackId="claude" fill={CLAUDE_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="claude_output" stackId="claude" fill={CLAUDE_COLOR_LIGHT} radius={[4, 4, 0, 0]} />
              <Bar dataKey="codex_input" stackId="codex" fill={CODEX_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="codex_output" stackId="codex" fill={CODEX_COLOR_LIGHT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
})

// Summary comparison cards showing side-by-side totals
interface SourceSummaryComparisonProps {
  data: SourceTrendPoint[]
}

export const SourceSummaryComparison = memo(function SourceSummaryComparison({ data }: SourceSummaryComparisonProps) {
  const totals = data.reduce(
    (acc, d) => ({
      claude_tokens: acc.claude_tokens + d.claude_inputTokens + d.claude_outputTokens,
      claude_cost: acc.claude_cost + d.claude_cost,
      codex_tokens: acc.codex_tokens + d.codex_inputTokens + d.codex_outputTokens,
      codex_cost: acc.codex_cost + d.codex_cost,
    }),
    { claude_tokens: 0, claude_cost: 0, codex_tokens: 0, codex_cost: 0 }
  )

  const metrics = [
    { label: 'Total Tokens', claude: formatNumber(totals.claude_tokens), codex: formatNumber(totals.codex_tokens) },
    { label: 'Total Cost', claude: `$${totals.claude_cost.toFixed(2)}`, codex: `$${totals.codex_cost.toFixed(2)}` },
    {
      label: 'Avg Daily Tokens',
      claude: data.length > 0 ? formatNumber(Math.round(totals.claude_tokens / data.length)) : '0',
      codex: data.length > 0 ? formatNumber(Math.round(totals.codex_tokens / data.length)) : '0',
    },
    {
      label: 'Avg Daily Cost',
      claude: data.length > 0 ? `$${(totals.claude_cost / data.length).toFixed(2)}` : '$0.00',
      codex: data.length > 0 ? `$${(totals.codex_cost / data.length).toFixed(2)}` : '$0.00',
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Summary Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          {/* Header row */}
          <div className="text-xs font-medium text-muted-foreground" />
          <div className="text-xs font-medium text-center">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
            Claude Code
          </div>
          <div className="text-xs font-medium text-center">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
            Codex
          </div>

          {/* Data rows */}
          {metrics.map((m) => (
            <Fragment key={m.label}>
              <div className="text-sm text-muted-foreground">{m.label}</div>
              <div className="text-sm font-mono text-center font-semibold text-blue-600">{m.claude}</div>
              <div className="text-sm font-mono text-center font-semibold text-emerald-600">{m.codex}</div>
            </Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})
