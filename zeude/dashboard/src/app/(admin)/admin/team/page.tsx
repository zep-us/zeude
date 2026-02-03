'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus, Key, Settings, Search, Copy, Check, Trash2 } from 'lucide-react'
import type { User, UserRole, UserStatus } from '@/lib/database.types'

type UserWithoutKey = Omit<User, 'agent_key' | 'invited_by'>

export default function TeamPage() {
  const [users, setUsers] = useState<UserWithoutKey[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteTeam, setInviteTeam] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('member')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserWithoutKey | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // Key dialog
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyUser, setKeyUser] = useState<UserWithoutKey | null>(null)
  const [newKey, setNewKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteUser, setDeleteUser] = useState<UserWithoutKey | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterTeam && filterTeam !== 'all') params.set('team', filterTeam)
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      if (search) params.set('search', search)

      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()

      if (res.ok) {
        setUsers(data.users)
        setTeams(data.teams)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }, [filterTeam, filterStatus, search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function handleGenerateInvite() {
    if (!inviteTeam) return

    setInviteLoading(true)
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: inviteTeam, role: inviteRole }),
      })

      const data = await res.json()
      if (res.ok) {
        setInviteUrl(data.url)
      }
    } catch (error) {
      console.error('Failed to generate invite:', error)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleEditUser() {
    if (!editUser) return

    setEditLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: editUser.team,
          role: editUser.role,
          status: editUser.status,
        }),
      })

      if (res.ok) {
        setEditOpen(false)
        fetchUsers()
      }
    } catch (error) {
      console.error('Failed to update user:', error)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleGenerateKey() {
    if (!keyUser) return

    setKeyLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${keyUser.id}/key`, {
        method: 'POST',
      })

      const data = await res.json()
      if (res.ok) {
        setNewKey(data.agentKey)
      }
    } catch (error) {
      console.error('Failed to generate key:', error)
    } finally {
      setKeyLoading(false)
    }
  }

  async function handleCopyKey() {
    await navigator.clipboard.writeText(newKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  function openEditDialog(user: UserWithoutKey) {
    setEditUser({ ...user })
    setEditOpen(true)
  }

  function openKeyDialog(user: UserWithoutKey) {
    setKeyUser(user)
    setNewKey('')
    setKeyOpen(true)
  }

  function openDeleteDialog(user: UserWithoutKey) {
    setDeleteUser(user)
    setDeleteOpen(true)
  }

  async function handleDeleteUser() {
    if (!deleteUser) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeleteOpen(false)
        setDeleteUser(null)
        fetchUsers()
      } else {
        const data = await res.json()
        console.error('Failed to delete user:', data.error)
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
    } finally {
      setDeleteLoading(false)
    }
  }

  function resetInviteDialog() {
    setInviteTeam('')
    setInviteRole('member')
    setInviteUrl('')
    setCopied(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Members</h1>
          <p className="text-muted-foreground">Manage your team and invite new members</p>
        </div>
        <Button onClick={() => { resetInviteDialog(); setInviteOpen(true) }}>
          <UserPlus className="h-4 w-4 mr-2" />
          Generate Invite Link
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name || '-'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.team}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                          title="Edit user"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openKeyDialog(user)}
                          title="Manage key"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openDeleteDialog(user)}
                          title="Delete user"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invite Link</DialogTitle>
            <DialogDescription>
              Create a single-use invite link that expires in 1 hour
            </DialogDescription>
          </DialogHeader>

          {!inviteUrl ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Team</label>
                <Input
                  value={inviteTeam}
                  onChange={(e) => setInviteTeam(e.target.value)}
                  placeholder="e.g., backend, frontend, devops"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button onClick={handleGenerateInvite} disabled={!inviteTeam || inviteLoading}>
                  {inviteLoading ? 'Generating...' : 'Generate Link'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Share this link (expires in 1 hour)</p>
                <div className="flex gap-2">
                  <Input value={inviteUrl} readOnly className="font-mono text-xs" />
                  <Button onClick={handleCopyInvite} variant="outline">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update {editUser?.name || editUser?.email}
            </DialogDescription>
          </DialogHeader>

          {editUser && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Team</label>
                <Input
                  value={editUser.team}
                  onChange={(e) => setEditUser({ ...editUser, team: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Select
                  value={editUser.role}
                  onValueChange={(v) => setEditUser({ ...editUser, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={editUser.status}
                  onValueChange={(v) => setEditUser({ ...editUser, status: v as UserStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditUser} disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Key Management Dialog */}
      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agent Key Management</DialogTitle>
            <DialogDescription>
              Manage agent key for {keyUser?.name || keyUser?.email}
            </DialogDescription>
          </DialogHeader>

          {!newKey ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a new agent key for this user. The old key will be invalidated immediately.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setKeyOpen(false)}>Cancel</Button>
                <Button onClick={handleGenerateKey} disabled={keyLoading}>
                  {keyLoading ? 'Generating...' : 'Generate New Key'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">New Agent Key (share securely)</p>
                <div className="flex gap-2">
                  <Input value={newKey} readOnly className="font-mono text-xs" />
                  <Button onClick={handleCopyKey} variant="outline">
                    {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setKeyOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteUser?.name || deleteUser?.email}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">This action cannot be undone.</p>
              <p className="text-sm text-muted-foreground mt-1">
                This will permanently delete the user and all associated data including:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                <li>User account and sessions</li>
                <li>Agent key</li>
                <li>ClickHouse analytics data</li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete User'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
