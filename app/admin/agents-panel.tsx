"use client"

import { useState, useTransition } from "react"
import {
  createAgent,
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
import { toast } from "sonner"
import { formatDate } from "@/lib/format"
import type { Branch, Cluster, WaterScheme, IamRole } from "@/lib/db/schema"
import { FileUp, Download } from "lucide-react"
import Link from "next/link"
import { downloadBulkImportTemplate } from "@/app/actions/bulk-import"

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
          <CardTitle>Add agent or admin</CardTitle>
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
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Role" />
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
                    <SelectTrigger className="bg-background"><SelectValue placeholder="No Cluster" /></SelectTrigger>
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
                    <SelectTrigger className="bg-background"><SelectValue placeholder="No Area" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Area</SelectItem>
                      {availableBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Scheme</Label>
                  <Select value={selectedSchemeId || "none"} onValueChange={(v) => setSelectedSchemeId(v === "none" ? null : v)}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="No Scheme" /></SelectTrigger>
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
                ) : "Create Agent Account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Agents &amp; admins</CardTitle>
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
                <TableHead className="pl-6">Agent Details</TableHead>
                <TableHead>System Role</TableHead>
                <TableHead>Hierarchy Access</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="pl-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-foreground">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.email}</span>
                      {agent.phone && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border">
                            {agent.phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={agent.iamRoleId || "none"}
                      onValueChange={(v) => v !== "none" && changeRole(agent, v)}
                    >
                      <SelectTrigger className="w-[180px] h-9 bg-background shadow-none border-transparent group-hover:border-input transition-all">
                        <SelectValue placeholder="Assign Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Role Assigned</SelectItem>
                        {iamRoles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 w-[220px]">
                      <div className="grid grid-cols-[70px_1fr] items-center">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">Cluster</span>
                        <Select
                          value={agent.clusterId ?? "none"}
                          onValueChange={(v) => updateHierarchy(agent, "cluster", v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] py-0 bg-transparent border-transparent group-hover:bg-background group-hover:border-input shadow-none transition-all">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {clusters.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-[70px_1fr] items-center">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">Branch</span>
                        <Select
                          value={agent.branchId ?? "none"}
                          onValueChange={(v) => updateHierarchy(agent, "branch", v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] py-0 bg-transparent border-transparent group-hover:bg-background group-hover:border-input shadow-none transition-all">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(agent.clusterId
                              ? branches.filter(b => b.clusterId === agent.clusterId)
                              : branches
                            ).map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-[70px_1fr] items-center">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">Scheme</span>
                        <Select
                          value={agent.schemeId ?? "none"}
                          onValueChange={(v) => updateHierarchy(agent, "scheme", v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] py-0 bg-transparent border-transparent group-hover:bg-background group-hover:border-input shadow-none transition-all">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(agent.branchId
                              ? schemes.filter(s => s.branchId === agent.branchId)
                              : []
                            ).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Switch
                        checked={agent.active}
                        onCheckedChange={() => toggleActive(agent)}
                        className="data-[state=checked]:bg-brand-blue"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(agent.createdAt)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-bold"
                          onClick={() => setResetTarget(agent)}
                        >
                          Reset Pass
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Reset password for {agent.name}</DialogTitle>
                          <DialogDescription>
                            Sets a new password immediately. Share it with them securely.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <Label htmlFor="new-password">New password</Label>
                            <Input
                              id="new-password"
                              type="password"
                              minLength={8}
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              autoComplete="new-password"
                            />
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
                  </TableCell>
                </TableRow>
              ))}
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
