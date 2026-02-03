/**
 * Efficiency Score Calculation Utilities
 *
 * Shared logic for calculating composite efficiency scores
 * used by both /api/admin/analytics/efficiency and /api/leaderboard
 */

// Target: 50 requests per dollar (good interactive usage)
export const REQUESTS_PER_DOLLAR_TARGET = 50

// Cache-weighted efficiency target
// (cacheReadTokens * 1.0 + outputTokens * 2.0) / costUsd
export const CACHE_WEIGHTED_TARGET = 100000

// Score thresholds for UI display
export const EFFICIENCY_THRESHOLDS = {
  excellent: 80,  // green
  good: 60,       // yellow
  // below 60 = red
}

// Cache hit rate thresholds
export const CACHE_THRESHOLDS = {
  excellent: 0.85,  // 85%+ cache hit = excellent
  good: 0.60,       // 60%+ = good
  // below 60% = needs improvement
}

export interface EfficiencyMetrics {
  retryDensity: number
  growthRate: number
  outputTokens: number
  costUsd: number
  // New fields for improved scoring
  cacheReadTokens?: number
  requestCount?: number
}

export interface EfficiencyScoreResult {
  efficiencyScore: number
  costEfficiency: number
  workQuality: number
  contextEfficiency: number
  // New metrics
  cacheEfficiency?: number
  requestsPerDollar?: number
}

/**
 * Calculate composite efficiency score from metrics
 *
 * NEW Components (weighted):
 * - Work Quality (10%): 1 - retry_density (lower retries = better)
 * - Context Efficiency (20%): 1 / growth_rate (less context explosion = better)
 * - Cache Efficiency (35%): cache_read_tokens / (cache_read_tokens + input_tokens)
 *   Higher cache usage = more efficient (leveraging prompt caching)
 * - Cost Efficiency (35%): requests_per_dollar OR cache-weighted tokens
 *   How much work done per dollar spent
 *
 * @param metrics - The efficiency metrics to calculate from
 * @returns Object containing the composite score and individual components
 */
export function calculateEfficiencyScore(metrics: EfficiencyMetrics): EfficiencyScoreResult {
  const {
    retryDensity,
    growthRate,
    outputTokens,
    costUsd,
    cacheReadTokens = 0,
    requestCount = 0
  } = metrics

  // 1. Work Quality (10%): 1 - retry_density (capped at 0 minimum)
  const workQuality = Math.max(0, 1 - retryDensity)

  // 2. Context Efficiency (20%): Penalize both extremes
  // - Too low (<0.5): Context shrinking = not leveraging previous work
  // - Too high (>2): Context explosion = inefficient accumulation
  // - Ideal: 0.5 ~ 2.0 (moderate growth is normal)
  let contextEfficiency: number
  if (growthRate < 0.5) {
    // Too low - linear penalty (0.5 → 1.0, 0.25 → 0.5, 0 → 0)
    contextEfficiency = growthRate * 2
  } else if (growthRate <= 2) {
    // Ideal range - perfect score
    contextEfficiency = 1.0
  } else {
    // Too high - inverse penalty
    contextEfficiency = Math.min(1, 2 / growthRate)
  }

  // 3. Cache Efficiency (35%): How well user leverages prompt caching
  // Higher cache read tokens relative to total processed = better
  let cacheEfficiency: number
  const totalProcessed = cacheReadTokens + outputTokens
  if (totalProcessed > 0) {
    // Cache read tokens as portion of total work
    cacheEfficiency = Math.min(1, cacheReadTokens / totalProcessed)
  } else {
    cacheEfficiency = 0.5 // Neutral for users with no data
  }

  // 4. Cost Efficiency (35%): Requests per dollar OR cache-weighted
  // Option A: How many interactions per dollar (rewards caching)
  // Option B: Cache-weighted tokens per dollar
  let costEfficiency: number
  let requestsPerDollar = 0

  if (costUsd <= 0) {
    costEfficiency = 0.5 // Neutral for free users
  } else {
    // Primary: Requests per dollar (cleaner metric)
    requestsPerDollar = requestCount / costUsd
    const requestsScore = Math.min(1, requestsPerDollar / REQUESTS_PER_DOLLAR_TARGET)

    // Secondary: Cache-weighted tokens per dollar
    const cacheWeightedTokens = (cacheReadTokens * 1.0) + (outputTokens * 2.0)
    const cacheWeightedScore = Math.min(1, cacheWeightedTokens / costUsd / CACHE_WEIGHTED_TARGET)

    // Blend both approaches (60% requests, 40% cache-weighted)
    costEfficiency = (requestsScore * 0.6) + (cacheWeightedScore * 0.4)
  }

  // Calculate composite efficiency score (0-100)
  // Weights: Work Quality 10%, Context 20%, Cache 35%, Cost 35%
  const efficiencyScore = Math.round(
    (workQuality * 10) +
    (contextEfficiency * 20) +
    (cacheEfficiency * 35) +
    (costEfficiency * 35)
  )

  return {
    efficiencyScore,
    costEfficiency,
    workQuality,
    contextEfficiency,
    cacheEfficiency,
    requestsPerDollar,
  }
}

/**
 * Get CSS color class for efficiency score
 *
 * @param score - Efficiency score (0-100)
 * @returns Tailwind CSS color class
 */
export function getEfficiencyColorClass(score: number): string {
  if (score >= EFFICIENCY_THRESHOLDS.excellent) return 'text-green-600'
  if (score >= EFFICIENCY_THRESHOLDS.good) return 'text-yellow-600'
  return 'text-red-600'
}
