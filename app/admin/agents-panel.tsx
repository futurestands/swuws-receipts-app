"use client"

import { useState, useTransition } from "react"
import {
  createAgent,
  updateAgent,
  deleteAgent,
  setAgentActive,
  setAgentRole,
  setAgentHierarchy,
  resetAgentPassword,
  listAgents,
} from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { formatDate } from "@/lib/format"
import type { Branch, Cluster, WaterScheme, IamRole } from "@/lib/db/schema"
import { FileUp, Download, Edit2, Trash2, Key, MapPin, Shield } from "lucide-react"
import Link from "next/link"
import { downloadBulkImportTemplate } from "@/app/actions/bulk-import"
import { cn } from "@/lib/utils"

import { ROLES, ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions/roles"

type Agent = {
  id: string
  name: string
  email: string
  phone?: string | null
  role: string
  iamRoleId?: string | null
  active: boolean
  clusterId?: string | null
  branchId: string | null
  schemeId?: string | null
  createdAt: Date
}

export function AgentsPanel({
  agents: initialAgents,
  agentsTotal,
  agentsPage,
  agentsPageSize,
  agentsTotalPages,
  clusters,
  branches,
  schemes,
  iamRoles = [],
}: {
  agents: Agent[]
  agentsTotal: number
  agentsPage: number
  agentsPageSize: number
  agentsTotalPages: number
  clusters: Cluster[]
  branches: Branch[]
  schemes: WaterScheme[]
  iamRoles?: IamRole[]
}) {
  const [agents, setAgents] = useState(initialAgents)
  const [pending, startTransition] = useTransition()

  // Search + pagination state. Loaded from the server one page at a time
  // (see listAgents in app/actions/admin.ts) rather than all at once, so
  // this stays fast as the number of agents grows.
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(agentsPage)
  const [total, setTotal] = useState(agentsTotal)
  const [totalPages, setTotalPages] = useState(agentsTotalPages)
  const [searching, startSearch] = useTransition()

  function loadPage(nextPage: number, nextQuery: string) {
    startSearch(async () => {
      const result = await listAgents({ query: nextQuery, page: nextPage, pageSize: agentsPageSize })
      setAgents(result.agents)
      setTotal(result.total)
      setPage(result.page)
      setTotalPages(result.totalPages)
    })
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    loadPage(1, query)
  }

  // Create-agent form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<string>("")
  const [selectedIamRoleId, setSelectedIamRoleId] = useState<string | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // Password reset dialog state
  const [resetTarget, setResetTarget] = useState<Agent | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [resetError, setResetError] = useState<string | null>(null)

  // Derived data for dropdowns
  const availableBranches = selectedClusterId
    ? branches.filter((b) => b.clusterId === selectedClusterId)
    : branches

  const availableSchemes = selectedBranchId
    ? schemes.filter((s) => s.branchId === selectedBranchId)
    : []

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    startTransition(async () => {
      const selectedRoleObj = iamRoles.find(r => r.id === selectedIamRoleId)
      const result = await createAgent({
        name,
        email,
        phone,
        password,
        role: selectedRoleObj?.code || "agent",
        iamRoleId: selectedIamRoleId,
        clusterId: selectedClusterId,
        branchId: selectedBranchId,
        schemeId: selectedSchemeId,
      })
      if (!result.ok) {
        setCreateError(result.error)
        return
      }
      toast.success("Account created")
      setName("")
      setEmail("")
      setPhone("")
      setPassword("")
      setRole("")
      setSelectedIamRoleId(null)
      setSelectedClusterId(null)
      setSelectedBranchId(null)
      setSelectedSchemeId(null)
      // Note: Full local state sync omitted for brevity, reload recommended
      window.location.reload()
    })
  }

  function toggleActive(agent: Agent) {
    startTransition(async () => {
      const result = await setAgentActive(agent.id, !agent.active)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, active: !a.active } : a)))
    })
  }

  function changeRole(agent: Agent, nextRoleId: string | null) {
    if (!nextRoleId) return
    const nextRoleObj = iamRoles.find(r => r.id === nextRoleId)
    if (!nextRoleObj) return

    startTransition(async () => {
      const result = await setAgentRole(agent.id, nextRoleObj.code, nextRoleId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, role: nextRoleObj.code, iamRoleId: nextRoleId } : a)))
    })
  }

  function updateHierarchy(
    agent: Agent,
    level: "cluster" | "branch" | "scheme",
    value: string | null,
  ) {
    const nextValue = value === "none" ? null : value
    const update = {
      clusterId: level === "cluster" ? nextValue : agent.clusterId,
      branchId: level === "branch" ? nextValue : agent.branchId,
      schemeId: level === "scheme" ? nextValue : agent.schemeId,
    }

    // Reset children if parent changes
    if (level === "cluster") {
      update.branchId = null
      update.schemeId = null
    } else if (level === "branch") {
      update.schemeId = null
    }

    startTransition(async () => {
      const result = await setAgentHierarchy(agent.id, update)
      if (!result.ok) {
        toast.error("Failed to update hierarchy")
        return
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, ...update } : a)),
      )
    })
  }

  async function handleDelete(agentId: string) {
    const result = await deleteAgent(agentId)
    if (result.ok) {
      toast.success("User account deleted")
      setAgents(prev => prev.filter(a => a.id !== agentId))
    } else {
      toast.error(result.error)
    }
  }

  function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetTarget) return
    setResetError(null)
    startTransition(async () => {
      const result = await resetAgentPassword(resetTarget.id, newPassword)
      if (!result.ok) {
        setResetError(result.error)
        return
      }
      toast.success(`Password reset for ${resetTarget.name}`)
      setResetTarget(null)
      setNewPassword("")
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">User Management</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/bulkusers">
              <FileUp className="h-4 w-4 mr-2" /> Bulk Import
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const base64 = await downloadBulkImportTemplate("xlsx")
              const byteCharacters = atob(base64)
              const byteNumbers = new Array(byteCharacters.length)
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
              }
              const byteArray = new Uint8Array(byteNumbers)
              const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `user-import-template.xlsx`
              a.click()
              window.URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add user or admin</CardTitle>
          <CardDescription>Creates a new account with an initial password.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Full Name</Label>
                <Input
                  id="agent-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-email">Email Address</Label>
                <Input
                  id="agent-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-phone">Phone (Optional)</Label>
                <Input
                  id="agent-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="256..."
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-password">Initial Password</Label>
                <Input
                  id="agent-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label>System Role</Label>
                <Select value={selectedIamRoleId || "none"} onValueChange={(v) => setSelectedIamRoleId(v === "none" ? null : v)}>
                  <SelectTrigger className="w-full h-11">
                    <span className="flex-1 text-left truncate">
                      {selectedIamRoleId === null ? "No Role" : (iamRoles.find(r => r.id === selectedIamRoleId)?.name || selectedIamRoleId)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Role</SelectItem>
                    {iamRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-muted-foreground/10 space-y-4">
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Organizational Assignment</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Cluster</Label>
                  <Select value={selectedClusterId || "none"} onValueChange={(v) => {
                    const id = v === "none" ? null : v
                    setSelectedClusterId(id)
                    setSelectedBranchId(null)
                    setSelectedSchemeId(null)
                  }}>
                    <SelectTrigger className="bg-background w-full h-11">
                      <span className="flex-1 text-left truncate">
                        {selectedClusterId === null ? "No Cluster" : (clusters.find(c => c.id === selectedClusterId)?.name || selectedClusterId)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Cluster</SelectItem>
                      {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Area (Branch)</Label>
                  <Select value={selectedBranchId || "none"} onValueChange={(v) => {
                    const id = v === "none" ? null : v
                    setSelectedBranchId(id)
                    setSelectedSchemeId(null)
                  }}>
                    <SelectTrigger className="bg-background w-full h-11">
                      <span className="flex-1 text-left truncate">
                        {selectedBranchId === null ? "No Area" : (branches.find(b => b.id === selectedBranchId)?.name || selectedBranchId)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Area</SelectItem>
                      {availableBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Scheme</Label>
                  <Select value={selectedSchemeId || "none"} onValueChange={(v) => setSelectedSchemeId(v === "none" ? null : v)}>
                    <SelectTrigger className="bg-background w-full h-11">
                      <span className="flex-1 text-left truncate">
                        {selectedSchemeId === null ? "No Scheme" : (schemes.find(s => s.id === selectedSchemeId)?.name || selectedSchemeId)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Scheme</SelectItem>
                      {availableSchemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {createError && (
              <p className="text-sm text-destructive font-medium">{createError}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending} className="min-w-[200px] h-11 font-bold">
                {pending ? (
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Creating...
                  </div>
                ) : "Create User Account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Users &amp; admins</CardTitle>
            <span className="text-sm text-muted-foreground">{total} total</span>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              placeholder="Search by name, email, or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" variant="outline" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-6 w-[250px]">User Details</TableHead>
                <TableHead>System Role</TableHead>
                <TableHead>Hierarchy Access</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => {
                const clusterName = clusters.find(c => c.id === agent.clusterId)?.name
                const branchName = branches.find(b => b.id === agent.branchId)?.name
                const schemeName = schemes.find(s => s.id === agent.schemeId)?.name

                return (
                  <TableRow key={agent.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-foreground">{agent.name}</span>
                        <span className="text-[11px] text-muted-foreground">{agent.email}</span>
                        {agent.phone && (
                          <span className="text-[10px] text-brand-blue font-medium mt-0.5">{agent.phone}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background text-[10px] uppercase font-bold tracking-tight">
                        {iamRoles.find(r => r.id === agent.iamRoleId)?.name || "No Role"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {clusterName ? (
                          <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded border border-muted-foreground/10">
                            <MapPin className="size-3" />
                            <span className="font-medium text-foreground truncate max-w-[120px]">
                              {clusterName}
                              {branchName && ` > ${branchName}`}
                              {schemeName && ` > ${schemeName}`}
                            </span>
                          </div>
                        ) : (
                          <span className="italic opacity-50">No hierarchy set</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Switch
                          checked={agent.active}
                          onCheckedChange={() => toggleActive(agent)}
                          className="data-[state=checked]:bg-brand-blue scale-75"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px] whitespace-nowrap">
                      {formatDate(agent.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit Action */}
                        <EditAgentDialog
                          agent={agent}
                          clusters={clusters}
                          branches={branches}
                          schemes={schemes}
                          iamRoles={iamRoles}
                          onUpdated={(updated) => {
                            setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
                          }}
                        />

                        {/* Reset Password Action */}
                        <Dialog
                          open={resetTarget?.id === agent.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setResetTarget(null)
                              setNewPassword("")
                              setResetError(null)
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button size="icon-sm" variant="ghost" className="h-8 w-8" onClick={() => setResetTarget(agent)}>
                              <Key className="size-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Reset password for {agent.name}</DialogTitle>
                              <DialogDescription>Sets a new password immediately. Share it with them securely.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
                              <div className="space-y-2">
                                <Label htmlFor="new-password">New password</Label>
                                <Input id="new-password" type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                              </div>
                              {resetError && <p className="text-sm text-destructive font-medium">{resetError}</p>}
                              <DialogFooter>
                                <Button type="submit" disabled={pending} className="w-full font-bold">
                                  {pending ? "Saving…" : "Confirm Password Reset"}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>

                        {/* Delete Action */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon-sm" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User Account?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove <strong>{agent.name}</strong> from the system.
                                Users who have issued receipts cannot be deleted and must be deactivated instead.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(agent.id)} className="bg-destructive hover:bg-destructive/90">
                                Delete Account
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || searching}
                onClick={() => loadPage(page - 1, query)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || searching}
                onClick={() => loadPage(page + 1, query)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EditAgentDialog({
  agent,
  clusters,
  branches,
  schemes,
  iamRoles,
  onUpdated
}: {
  agent: Agent
  clusters: Cluster[]
  branches: Branch[]
  schemes: WaterScheme[]
  iamRoles: IamRole[]
  onUpdated: (agent: Agent) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(agent.name)
  const [email, setEmail] = useState(agent.email)
  const [phone, setPhone] = useState(agent.phone || "")
  const [iamRoleId, setIamRoleId] = useState<string>(agent.iamRoleId || "none")
  const [clusterId, setClusterId] = useState<string>(agent.clusterId || "none")
  const [branchId, setBranchId] = useState<string>(agent.branchId || "none")
  const [schemeId, setSchemeId] = useState<string>(agent.schemeId || "none")
  const [pending, startTransition] = useTransition()

  const availableBranches = clusterId !== "none"
    ? branches.filter(b => b.clusterId === clusterId)
    : branches

  const availableSchemes = branchId !== "none"
    ? schemes.filter(s => s.branchId === branchId)
    : []

  async function handleSave() {
    startTransition(async () => {
      // 1. Update basic details
      const basicRes = await updateAgent(agent.id, { name, email, phone })
      if (!basicRes.ok) {
        toast.error(basicRes.error)
        return
      }

      // 2. Update Role
      const targetRole = iamRoles.find(r => r.id === iamRoleId)?.code || agent.role
      const roleRes = await setAgentRole(agent.id, targetRole, iamRoleId === "none" ? null : iamRoleId)
      if (!roleRes.ok) {
        toast.error(roleRes.error)
        return
      }

      // 3. Update Hierarchy
      const hierRes = await setAgentHierarchy(agent.id, {
        clusterId: clusterId === "none" ? null : clusterId,
        branchId: branchId === "none" ? null : branchId,
        schemeId: schemeId === "none" ? null : schemeId
      })
      if (!hierRes.ok) {
        toast.error(hierRes.error)
        return
      }

      toast.success("User updated successfully")
      onUpdated({
        ...agent,
        name,
        email,
        phone,
        role: targetRole,
        iamRoleId: iamRoleId === "none" ? null : iamRoleId,
        clusterId: clusterId === "none" ? null : clusterId,
        branchId: branchId === "none" ? null : branchId,
        schemeId: schemeId === "none" ? null : schemeId
      })
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" className="h-8 w-8">
          <Edit2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit User: {agent.name}</DialogTitle>
          <DialogDescription>Update profile details, permissions, and regional access.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>System Role</Label>
            <Select value={iamRoleId} onValueChange={(v) => setIamRoleId(v || "none")}>
              <SelectTrigger className="w-full h-11">
                <span className="flex-1 text-left truncate">
                  {iamRoleId === "none" ? "No Role Assigned" : (iamRoles.find(r => r.id === iamRoleId)?.name || iamRoleId)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Role Assigned</SelectItem>
                {iamRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 rounded-lg bg-muted/50 space-y-3">
             <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Hierarchy Access</p>
             <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                   <Label className="text-[9px] uppercase">Cluster</Label>
                   <Select value={clusterId} onValueChange={(v) => { setClusterId(v || "none"); setBranchId("none"); setSchemeId("none"); }}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <span className="flex-1 text-left truncate">
                          {clusterId === "none" ? "None" : (clusters.find(c => c.id === clusterId)?.name || clusterId)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="none">None</SelectItem>
                         {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                   </Select>
                </div>
                <div className="space-y-1">
                   <Label className="text-[9px] uppercase">Area</Label>
                   <Select value={branchId} onValueChange={(v) => { setBranchId(v || "none"); setSchemeId("none"); }}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <span className="flex-1 text-left truncate">
                          {branchId === "none" ? "None" : (branches.find(b => b.id === branchId)?.name || branchId)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="none">None</SelectItem>
                         {availableBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                   </Select>
                </div>
                <div className="space-y-1">
                   <Label className="text-[9px] uppercase">Scheme</Label>
                   <Select value={schemeId} onValueChange={(v) => setSchemeId(v || "none")}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <span className="flex-1 text-left truncate">
                          {schemeId === "none" ? "None" : (schemes.find(s => s.id === schemeId)?.name || schemeId)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="none">None</SelectItem>
                         {availableSchemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                   </Select>
                </div>
             </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <div className="flex items-center gap-2"><div className="size-3 border-2 border-white/30 border-t-white animate-spin rounded-full" /> Saving...</div> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
