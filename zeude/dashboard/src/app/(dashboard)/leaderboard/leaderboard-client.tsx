'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trophy, RefreshCw, Medal, Wand2, RotateCcw } from 'lucide-react'
import { SourceFilter, type SourceFilterValue } from '@/components/dashboard/source-filter'
import { useLeaderboard } from '@/hooks/use-leaderboard'

export default function LeaderboardClient({ initialCohort }: { initialCohort: string }) {
  const [source, setSource] = useState<SourceFilterValue>('all')

  const { data, isLoading: loading, refetch, isFetching } = useLeaderboard(initialCohort, source)

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

  function formatKstDateTime(iso: string) {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground">
            {data?.cohort ? 'Cohort scoped leaderboard' : 'Monday 08:00 KST weekly reset leaderboard'}
          </p>
          {data?.cohort && (
            <div className="text-sm text-muted-foreground mt-1 space-y-1">
              <p>
                Cohort: <span className="font-mono">{data.cohort.cohortKey}</span> ({data.cohort.memberCount} members)
              </p>
              {data.cohort.startedAt && (
                <p>Started: {formatKstDateTime(data.cohort.startedAt)} (KST)</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SourceFilter value={source} onChange={setSource} />
          <Button variant="outline" size="icon" onClick={() => { void refetch() }} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {data?.weekWindow && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">{data.cohort ? 'Current period' : 'This week'}</p>
                <p className="font-medium">
                  {formatKstDateTime(data.weekWindow.currentStart)} ~ {formatKstDateTime(data.weekWindow.currentEnd)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{data.cohort ? 'Skill tracking period' : 'Last week'}</p>
                {data.cohort?.skillDayStart && data.cohort?.skillDayEnd ? (
                  <p className="font-medium">
                    {formatKstDateTime(data.cohort.skillDayStart)} ~ {formatKstDateTime(data.cohort.skillDayEnd)}
                  </p>
                ) : (
                  <p className="font-medium">
                    {formatKstDateTime(data.weekWindow.previousStart)} ~ {formatKstDateTime(data.weekWindow.previousEnd)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Next reset</p>
                <p className="font-medium">{formatKstDateTime(data.weekWindow.nextReset)} (KST)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data?.cohort ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Cohort Token Rank
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cumulative tokens since cohort registration
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 skeleton-shimmer rounded-lg" />
                  ))}
                </div>
              ) : data.topTokenUsers.length ? (
                <div className="space-y-2">
                  {data.topTokenUsers.map((user) => (
                    <div
                      key={`${user.userId}-${user.rank}`}
                      className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(user.rank)}`}
                    >
                      <div className="flex items-center gap-3">
                        {getRankIcon(user.rank)}
                        <span className="font-medium">{user.userName}</span>
                      </div>
                      <span className="font-mono text-sm font-semibold">{user.formattedValue}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No cohort token data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wand2 className="h-5 w-5 text-violet-500" />
                Cohort Skill Rank
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cohort skill usage today
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 skeleton-shimmer rounded-lg" />
                  ))}
                </div>
              ) : data.topSkills.length ? (
                <div className="space-y-2">
                  {data.topSkills.map((skill) => (
                    <div
                      key={`${skill.skillName}-${skill.rank}`}
                      className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(skill.rank)}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getRankIcon(skill.rank)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">/{skill.skillName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {skill.userCount} users{skill.topUsers?.length ? `: ${skill.topUsers.join(', ')}${skill.userCount > skill.topUsers.length ? ', ...' : ''}` : ''}
                            </span>
                          </div>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {skill.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-sm font-semibold text-violet-600 shrink-0 ml-3">
                        {skill.formattedValue}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No cohort skill data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  This Week Token Rank
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cumulative tokens since Monday 08:00 KST reset
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
                        key={`${user.userId}-${user.rank}`}
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
                    No data this week yet
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RotateCcw className="h-5 w-5 text-sky-500" />
                  Last Week Final Rank
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Final token ranking from the previous week
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : data?.previousTopTokenUsers.length ? (
                  <div className="space-y-2">
                    {data.previousTopTokenUsers.map((user) => (
                      <div
                        key={`${user.userId}-${user.rank}`}
                        className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(user.rank)}`}
                      >
                        <div className="flex items-center gap-3">
                          {getRankIcon(user.rank)}
                          <span className="font-medium">{user.userName}</span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-sky-600">
                          {user.formattedValue}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No data from last week
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wand2 className="h-5 w-5 text-violet-500" />
                Top Skills This Week
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Most invoked skills this week
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 skeleton-shimmer rounded-lg" />
                  ))}
                </div>
              ) : data?.topSkills.length ? (
                <div className="space-y-2">
                  {data.topSkills.map((skill) => (
                    <div
                      key={`${skill.skillName}-${skill.rank}`}
                      className={`flex items-center justify-between p-3 rounded-lg border ${getRankBg(skill.rank)}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getRankIcon(skill.rank)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">/{skill.skillName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {skill.userCount} users{skill.topUsers?.length ? `: ${skill.topUsers.join(', ')}${skill.userCount > skill.topUsers.length ? ', ...' : ''}` : ''}
                            </span>
                          </div>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {skill.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-sm font-semibold text-violet-600 shrink-0 ml-3">
                        {skill.formattedValue}
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
        </>
      )}

      {data && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(data.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (KST)
        </p>
      )}
    </div>
  )
}
