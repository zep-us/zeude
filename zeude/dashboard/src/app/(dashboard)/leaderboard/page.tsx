'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trophy, Zap, RefreshCw, Medal, Wand2, Users } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LeaderboardUser {
  rank: number
  userName: string
  value: number
  formattedValue: string
}

interface SkillLeaderboardUser {
  rank: number
  userName: string
  skillCount: number
  topSkill: string
}

interface LeaderboardData {
  topTokenUsers: LeaderboardUser[]
  topEfficiencyUsers: LeaderboardUser[]
  topSkillUsers: SkillLeaderboardUser[]
  skillAdoption: {
    totalUsers: number
    skillUsers: number
    adoptionRate: number
  }
  period: string
  updatedAt: string
}

type Period = '7d' | '30d' | '90d'

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LeaderboardData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leaderboard?period=${period}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function getRankIcon(rank: number) {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />
    return <span className="w-5 text-center text-muted-foreground">{rank}</span>
  }

  function getRankBg(rank: number) {
    if (rank === 1) return 'bg-yellow-500/10 border-yellow-500/20'
    if (rank === 2) return 'bg-gray-500/10 border-gray-500/20'
    if (rank === 3) return 'bg-amber-500/10 border-amber-500/20'
    return 'bg-muted/50'
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground">
            Top performers in token usage and efficiency
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  period === p
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Token Users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Most Active Users
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ranked by total tokens processed
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : data?.topTokenUsers.length ? (
              <div className="space-y-2">
                {data.topTokenUsers.map((user) => (
                  <div
                    key={user.rank}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(user.rank)}`}
                  >
                    <div className="flex items-center gap-3">
                      {getRankIcon(user.rank)}
                      <span className="font-medium">{user.userName}</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">
                      {user.formattedValue}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Efficiency Users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-green-500" />
              Most Efficient Users
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ranked by composite efficiency score
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : data?.topEfficiencyUsers.length ? (
              <div className="space-y-2">
                {data.topEfficiencyUsers.map((user) => (
                  <div
                    key={user.rank}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(user.rank)}`}
                  >
                    <div className="flex items-center gap-3">
                      {getRankIcon(user.rank)}
                      <span className="font-medium">{user.userName}</span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${
                      user.value >= 80 ? 'text-green-600' :
                      user.value >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {user.formattedValue}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Skill Usage Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Skill Adoption Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-blue-500" />
              Skill Adoption
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              How many users leverage workflows
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-24 bg-muted animate-pulse rounded-lg" />
            ) : data?.skillAdoption ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600">
                    {data.skillAdoption.adoptionRate}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {data.skillAdoption.skillUsers} of {data.skillAdoption.totalUsers} users
                  </p>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${data.skillAdoption.adoptionRate}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Skill Users */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wand2 className="h-5 w-5 text-purple-500" />
              Top Skill Users
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Most skill/command invocations
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : data?.topSkillUsers.length ? (
              <div className="space-y-2">
                {data.topSkillUsers.slice(0, 5).map((user) => (
                  <div
                    key={user.rank}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(user.rank)}`}
                  >
                    <div className="flex items-center gap-3">
                      {getRankIcon(user.rank)}
                      <div>
                        <span className="font-medium">{user.userName}</span>
                        {user.topSkill && (
                          <span className="text-xs text-muted-foreground ml-2">
                            Top: /{user.topSkill}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold text-purple-600">
                      {user.skillCount} calls
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No skill usage data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(data.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
    </TooltipProvider>
  )
}
