'use client'

import { useState, useCallback } from 'react'
import type { Skill } from '@/lib/database.types'
import { useSkills, useSaveSkill, useDeleteSkill } from '@/hooks/use-skills'
import { type SkillFormData, defaultFormData, generateSlug } from './types'

export function useSkillState() {
  const { data, isLoading: loading, isError, refetch } = useSkills()
  const saveSkillMutation = useSaveSkill()
  const deleteSkillMutation = useDeleteSkill()

  const skills = data?.skills ?? []
  const teams = data?.teams ?? []
  const users = data?.users ?? []
  const disableCounts = data?.disableCounts ?? {}
  const totalActiveUsers = data?.totalActiveUsers ?? 0

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<SkillFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSlug, setAutoSlug] = useState(true)

  // Copy state
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreateDialog = useCallback(() => {
    setDialogMode('create')
    setEditingId(null)
    setFormData(defaultFormData)
    setAutoSlug(true)
    setError(null)
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((skill: Skill) => {
    setDialogMode('edit')
    setEditingId(skill.id)

    // Extract additional files from files JSONB (everything except SKILL.md)
    const additionalFiles: Record<string, string> = {}
    let mainContent = skill.content ?? ''

    if (skill.files && Object.keys(skill.files).length > 0) {
      for (const [path, fileContent] of Object.entries(skill.files)) {
        if (path === 'SKILL.md') {
          mainContent = fileContent
        } else {
          additionalFiles[path] = fileContent
        }
      }
    }

    setFormData({
      name: skill.name,
      slug: skill.slug,
      description: skill.description || '',
      content: mainContent,
      teams: skill.teams,
      isGlobal: skill.is_global,
      primaryKeywords: skill.primary_keywords || skill.keywords || [],
      secondaryKeywords: skill.secondary_keywords || [],
      hint: skill.hint || '',
      additionalFiles,
      contributors: skill.contributors || [],
    })
    setAutoSlug(false)
    setError(null)
    setDialogOpen(true)
  }, [])

  const handleNameChange = useCallback((name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      ...(autoSlug ? { slug: generateSlug(name) } : {}),
    }))
  }, [autoSlug])

  const handleSlugChange = useCallback((slug: string) => {
    setAutoSlug(false)
    setFormData(prev => ({ ...prev, slug }))
  }, [])

  const toggleTeam = useCallback((team: string) => {
    setFormData(prev => {
      if (prev.teams.includes(team)) {
        return { ...prev, teams: prev.teams.filter(t => t !== team) }
      }
      return { ...prev, teams: [...prev.teams, team] }
    })
  }, [])

  const copySlug = useCallback(async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`/${slug}`)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!formData.name || !formData.slug || !formData.content) return

    setSaving(true)
    setError(null)

    try {
      // Always build files: SKILL.md + any additional files
      const files: Record<string, string> = { 'SKILL.md': formData.content }
      for (const [path, fileContent] of Object.entries(formData.additionalFiles)) {
        if (path && fileContent) {
          files[path] = fileContent
        }
      }

      const payload: Record<string, unknown> = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        files,
        teams: formData.teams,
        isGlobal: formData.isGlobal,
        primaryKeywords: formData.primaryKeywords,
        secondaryKeywords: formData.secondaryKeywords,
        hint: formData.hint || null,
        contributors: formData.contributors,
      }

      // PATCH (edit): include content for backward compat with existing skills
      if (dialogMode === 'edit') {
        payload.content = formData.content
      }

      await saveSkillMutation.mutateAsync({
        id: dialogMode === 'edit' ? editingId : null,
        data: payload,
      })
      setDialogOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save skill'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [dialogMode, editingId, formData, saveSkillMutation])

  const handleDelete = useCallback(async () => {
    if (!deletingSkill) return

    setDeleting(true)
    try {
      await deleteSkillMutation.mutateAsync(deletingSkill.id)
      setDeleteOpen(false)
    } catch (err) {
      console.error('Failed to delete skill:', err)
    } finally {
      setDeleting(false)
    }
  }, [deletingSkill, deleteSkillMutation])

  return {
    skills,
    teams,
    users,
    loading,
    isError,
    refetch,
    disableCounts,
    totalActiveUsers,
    dialogOpen,
    setDialogOpen,
    dialogMode,
    formData,
    setFormData,
    saving,
    error,
    setError,
    autoSlug,
    copiedSlug,
    deleteOpen,
    setDeleteOpen,
    deletingSkill,
    setDeletingSkill,
    deleting,
    openCreateDialog,
    openEditDialog,
    handleNameChange,
    handleSlugChange,
    toggleTeam,
    copySlug,
    handleSave,
    handleDelete,
  }
}
