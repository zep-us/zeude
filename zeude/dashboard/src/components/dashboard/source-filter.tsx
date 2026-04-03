'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useCallback } from 'react'

export type SourceFilterValue = 'all' | 'claude' | 'codex'

const SOURCE_OPTIONS: { value: SourceFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
]

interface SourceFilterProps {
  /** Current selected source value */
  value?: SourceFilterValue
  /** Callback when value changes (for client-side state management) */
  onChange?: (value: SourceFilterValue) => void
  /**
   * If true, updates URL search params instead of calling onChange.
   * Useful for server-rendered pages that read `searchParams.source`.
   */
  useSearchParams?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Shared source filter component for selecting Claude Code vs Codex data.
 *
 * Two usage modes:
 * 1. Controlled (onChange): For client components managing their own state (e.g., Leaderboard)
 * 2. URL-based (useSearchParams): For server-rendered pages that read `searchParams.source`
 *
 * Wrapped in Suspense internally to satisfy Next.js App Router requirements
 * for useSearchParams().
 */
export function SourceFilter(props: SourceFilterProps) {
  return (
    <Suspense fallback={<SourceFilterSkeleton />}>
      <SourceFilterInner {...props} />
    </Suspense>
  )
}

function SourceFilterSkeleton() {
  return (
    <div className="flex border rounded-lg">
      {SOURCE_OPTIONS.map((option) => (
        <div
          key={option.value}
          className={`px-3 py-1.5 text-sm text-muted-foreground ${
            option.value === 'all' ? 'rounded-l-lg bg-muted' : ''
          } ${option.value === 'codex' ? 'rounded-r-lg' : ''}`}
        >
          {option.label}
        </div>
      ))}
    </div>
  )
}

function SourceFilterInner({
  value,
  onChange,
  useSearchParams: useUrlParams = false,
  className = '',
}: SourceFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Determine current value: explicit prop > URL param > default 'all'
  const currentValue: SourceFilterValue =
    value ?? (searchParams.get('source') as SourceFilterValue) ?? 'all'

  const handleChange = useCallback(
    (newValue: SourceFilterValue) => {
      if (onChange) {
        onChange(newValue)
      }

      if (useUrlParams) {
        const params = new URLSearchParams(searchParams.toString())
        params.set('source', newValue)
        const query = params.toString()
        router.push(`${pathname}${query ? `?${query}` : ''}`)
      }
    },
    [onChange, useUrlParams, searchParams, router, pathname]
  )

  return (
    <div className={`flex border rounded-lg ${className}`}>
      {SOURCE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => handleChange(option.value)}
          className={`px-3 py-1.5 text-sm transition-colors ${
            currentValue === option.value
              ? 'bg-blue-600 text-white'
              : 'hover:bg-muted'
          } ${option.value === 'all' ? 'rounded-l-lg' : ''} ${
            option.value === 'codex' ? 'rounded-r-lg' : ''
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
