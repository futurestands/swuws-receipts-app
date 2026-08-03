"use client"

import { useState, useTransition } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Shield, Plus, Key, Users, Edit2, Loader2, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import type { IamRole, IamPermission } from "@/lib/db/schema"
import { listRoles, listAllPermissions, createRole, updateRole, setRoleActive, getRolePermissions, updateRolePermissions } from "@/app/actions/iam"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export function IamPanel({
  initialRoles,
  allPermissions
}: {
  initialRoles: IamRole[]
  allPermissions: IamPermission[]
}) {
  const [roles, setRoles] = useState(initialRoles)
  const [activeTab, setActiveTab] = useState("roles")
  const [pending, startTransition] = useTransition()

  // Role Editor state
  const [editingRole, setEditingRole] = useState<IamRole | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [roleForm, setRoleForm] = useState({
    name: "",
    code: "",
    description: "",
    level: 0,
    parentId: null as string | null,
    active: true,
  })

  // Permission Matrix state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(initialRoles[0]?.id || null)
  const [rolePermissions, setRolePermissions] = useState<Record<string, string>>({})
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false)

  async function loadRolePermissions(roleId: string) {
    setIsPermissionsLoading(true)
    try {
      const grants = await getRolePermissions(roleId)
      const mapped = grants.reduce((acc, g) => ({ ...acc, [g.permissionId]: g.scope }), {})
      setRolePermissions(mapped)
    } catch (err) {
      toast.error("Failed to load permissions")
    } finally {
      setIsPermissionsLoading(false)
    }
  }

  function handleEditRole(role: IamRole) {
    setEditingRole(role)
    setRoleForm({
      name: role.name,
      code: role.code,
      description: role.description || "",
      level: role.level,
      parentId: role.parentId,
      active: role.active,
    })
    setIsCreating(false)
  }

  function handleCreateRole() {
    setEditingRole(null)
    setRoleForm({
      name: "",
      code: "",
      description: "",
      level: 1,
      parentId: null,
      active: true,
    })
    setIsCreating(true)
  }

  async function saveRole() {
    startTransition(async () => {
      const data = {
        ...roleForm,
        level: Number(roleForm.level),
      }
      const action = isCreating ? createRole(data) : updateRole(editingRole!.id, data)
      const result = await action
      if (result.ok) {
        toast.success(isCreating ? "Role created" : "Role updated")
        setIsCreating(false)
        setEditingRole(null)
        // Refresh roles list
        const updated = await listRoles()
        setRoles(updated)
      } else {
        toast.error(result.error)
      }
    })
  }

  async function toggleRoleActive(role: IamRole) {
    startTransition(async () => {
      const result = await setRoleActive(role.id, !role.active)
      if (result.ok) {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, active: !r.active } : r))
      }
    })
  }

  async function savePermissions() {
    if (!selectedRoleId) return
    startTransition(async () => {
      try {
        const grants = Object.entries(rolePermissions).map(([permissionId, scope]) => ({
          permissionId,
          scope
        }))
        const result = await updateRolePermissions(selectedRoleId, grants)
        if (result.ok) {
          toast.success("Permissions updated")
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save permissions"
        toast.error(message)
      }
    })
  }

  // Group permissions by module
  const modules = Array.from(new Set(allPermissions.map(p => p.module)))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Identity &amp; Access Management</h2>
        <Button onClick={handleCreateRole} size="sm">
          <Plus className="h-4 w-4 mr-2" /> New Role
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="roles">Roles &amp; Hierarchy</TabsTrigger>
          <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Defined System Roles</CardTitle>
              <CardDescription>Manage business titles and their inheritance hierarchy.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map(role => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {role.isSystem ? <Shield className="h-3 w-3 text-primary" /> : <Users className="h-3 w-3 text-muted-foreground" />}
                          {role.name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{role.code}</TableCell>
                      <TableCell>{role.level}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {roles.find(r => r.id === role.parentId)?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={role.active}
                            disabled={role.isSystem || pending}
                            onCheckedChange={() => toggleRoleActive(role)}
                          />
                          <Badge variant={role.active ? "default" : "secondary"}>
                            {role.active ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => handleEditRole(role)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => {
                            setSelectedRoleId(role.id)
                            setActiveTab("permissions")
                            loadRolePermissions(role.id)
                          }}>
                            <Key className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-4">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-sm">Select Role</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-col">
                  {roles.map(role => (
                    <button
                      key={role.id}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 text-sm text-left transition-colors hover:bg-accent",
                        selectedRoleId === role.id ? "bg-accent border-r-2 border-primary font-medium" : "text-muted-foreground"
                      )}
                      onClick={() => {
                        setSelectedRoleId(role.id)
                        loadRolePermissions(role.id)
                      }}
                    >
                      <span>{role.name}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Permission Matrix</CardTitle>
                  <CardDescription>Assign capabilities to the selected role.</CardDescription>
                </div>
                <Button size="sm" onClick={savePermissions} disabled={pending || isPermissionsLoading}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </CardHeader>
              <CardContent className="space-y-8">
                {isPermissionsLoading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mr-3" /> Loading permissions...
                  </div>
                ) : (
                  modules.map(module => (
                    <div key={module} className="space-y-4">
                      <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">{module}</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {allPermissions.filter(p => p.module === module).map(permission => (
                          <div key={permission.id} className="flex flex-col gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <Label className="font-medium cursor-pointer" onClick={() => {
                                  const current = rolePermissions[permission.id]
                                  setRolePermissions(prev => {
                                    const next = { ...prev }
                                    if (current) delete next[permission.id]
                                    else next[permission.id] = 'own'
                                    return next
                                  })
                                }}>
                                  {permission.name}
                                </Label>
                                <p className="text-[10px] text-muted-foreground">{permission.description}</p>
                              </div>
                              <Checkbox
                                checked={!!rolePermissions[permission.id]}
                                onCheckedChange={(checked) => {
                                  setRolePermissions(prev => {
                                    const next = { ...prev }
                                    if (checked) next[permission.id] = prev[permission.id] || 'own'
                                    else delete next[permission.id]
                                    return next
                                  })
                                }}
                              />
                            </div>
                            {rolePermissions[permission.id] && (
                              <div className="pt-2 border-t mt-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Scope:</span>
                                  <Select
                                    value={rolePermissions[permission.id]}
                                    onValueChange={(v) => {
                              if (!v) return;
                              setRolePermissions(prev => ({ ...prev, [permission.id]: v }))
                            }}
                                  >
                                    <SelectTrigger className="h-6 text-[10px] w-32 px-2 py-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="own">Own</SelectItem>
                                      <SelectItem value="scheme">Scheme</SelectItem>
                                      <SelectItem value="area">Area</SelectItem>
                                      <SelectItem value="cluster">Cluster</SelectItem>
                                      <SelectItem value="global">Global</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Role Editor Dialog */}
      <Dialog open={isCreating || !!editingRole} onOpenChange={(open) => { if (!open) { setIsCreating(false); setEditingRole(null); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{isCreating ? "Create New Role" : `Edit Role: ${editingRole?.name}`}</DialogTitle>
            <DialogDescription> Business title and position in the organizational hierarchy.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input value={roleForm.name} onChange={e => setRoleForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Code (Machine Name)</Label>
              <Input
                value={roleForm.code}
                disabled={editingRole?.isSystem}
                placeholder="e.g. general_manager"
                onChange={e => setRoleForm(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Level (0-100)</Label>
                <Input type="number" value={roleForm.level} onChange={e => setRoleForm(prev => ({ ...prev, level: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Parent Role</Label>
                <Select value={roleForm.parentId || "none"} onValueChange={v => setRoleForm(prev => ({ ...prev, parentId: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {roles.filter(r => r.id !== editingRole?.id).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={roleForm.description} onChange={e => setRoleForm(prev => ({ ...prev, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingRole(null); }}>Cancel</Button>
            <Button onClick={saveRole} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
