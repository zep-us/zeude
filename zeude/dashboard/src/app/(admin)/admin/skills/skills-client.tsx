'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

import { useSkillState } from './use-skill-state'
import { SkillTable } from './skill-table'
import { SkillDialog } from './skill-dialog'

export default function SkillsClient() {
  const {
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
  } = useSkillState()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground">
            Manage reusable prompts and workflows for team members
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Skill
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <div className="text-center py-8">
              <p className="text-destructive mb-2">Failed to load skills</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : (
          <>
          <SkillTable
            skills={skills}
            loading={loading}
            copiedSlug={copiedSlug}
            disableCounts={disableCounts}
            totalActiveUsers={totalActiveUsers}
            onEdit={openEditDialog}
            onDelete={(skill) => { setDeletingSkill(skill); setDeleteOpen(true) }}
            onCopySlug={copySlug}
          />

          <p className="text-xs text-muted-foreground mt-4">
            Skills are synced to team members on their next claude execution. Use /{'{slug}'} to invoke.
          </p>
          </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <SkillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        formData={formData}
        setFormData={setFormData}
        teams={teams}
        users={users}
        autoSlug={autoSlug}
        onNameChange={handleNameChange}
        onSlugChange={handleSlugChange}
        onToggleTeam={toggleTeam}
        onSave={handleSave}
        saving={saving}
        error={error}
        setError={setError}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingSkill?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
