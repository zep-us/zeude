import type { Skill } from '@/lib/database.types'

export interface SkillFormData {
  name: string
  slug: string
  description: string
  content: string // SKILL.md content
  teams: string[]
  isGlobal: boolean
  primaryKeywords: string[]
  secondaryKeywords: string[]
  hint: string
  additionalFiles: Record<string, string> // extra files beyond SKILL.md
  contributors: string[] // user UUIDs
}

export const defaultFormData: SkillFormData = {
  name: '',
  slug: '',
  description: '',
  content: '',
  teams: [],
  isGlobal: false,
  primaryKeywords: [],
  secondaryKeywords: [],
  hint: '',
  additionalFiles: {},
  contributors: [],
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
