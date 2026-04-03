import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Settings, Trash2, Copy, Check, FolderOpen, UserX, Users } from 'lucide-react'
import type { Skill } from '@/lib/database.types'

interface SkillTableProps {
  skills: Skill[]
  loading: boolean
  copiedSlug: string | null
  disableCounts: Record<string, number>
  totalActiveUsers: number
  onEdit: (skill: Skill) => void
  onDelete: (skill: Skill) => void
  onCopySlug: (slug: string) => void
}

export function SkillTable({
  skills,
  loading,
  copiedSlug,
  disableCounts,
  totalActiveUsers,
  onEdit,
  onDelete,
  onCopySlug,
}: SkillTableProps) {
  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (skills.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No skills configured. Add your first skill to get started.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Teams</TableHead>
          <TableHead>Creator</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Disabled By</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((skill) => (
          <TableRow key={skill.id}>
            <TableCell>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{skill.name}</span>
                  {skill.files && Object.keys(skill.files).length > 1 && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {Object.keys(skill.files).length}
                    </Badge>
                  )}
                </div>
                {skill.description && (
                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {skill.description}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>
              <button
                onClick={() => onCopySlug(skill.slug)}
                className="flex items-center gap-1 font-mono text-sm hover:text-primary transition-colors"
                title="Copy slug"
              >
                /{skill.slug}
                {copiedSlug === skill.slug ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 opacity-50" />
                )}
              </button>
            </TableCell>
            <TableCell>
              {skill.is_global ? (
                <Badge>All Teams</Badge>
              ) : skill.teams.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {skill.teams.map((team) => (
                    <Badge key={team} variant="outline">{team}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <span className="text-sm">
                  {skill.created_by_name || '-'}
                </span>
                {(skill.contributors?.length ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs gap-1" title={
                    (skill.contributor_names || []).join(', ')
                  }>
                    <Users className="h-3 w-3" />
                    +{skill.contributors?.length ?? 0}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={skill.status === 'active' ? 'default' : 'secondary'}>
                {skill.status}
              </Badge>
            </TableCell>
            <TableCell>
              {disableCounts[skill.slug] ? (
                <div className="flex items-center gap-1 text-sm">
                  <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{disableCounts[skill.slug]}</span>
                  <span className="text-muted-foreground text-xs">/ {totalActiveUsers}</span>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">-</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onEdit(skill)}
                  title="Edit skill"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onDelete(skill)}
                  title="Delete skill"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
