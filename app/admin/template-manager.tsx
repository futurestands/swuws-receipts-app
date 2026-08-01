"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  FileText,
  History as HistoryIcon,
  CheckCircle2,
  Play,
  Save,
  ChevronRight,
  Braces,
  MessageSquare,
  Code,
  ArrowLeft,
  Zap
} from "lucide-react"
import { listTemplates, getTemplateHistory, saveTemplateDraft, publishTemplateVersion, saveAndPublishTemplate } from "@/app/actions/template-actions"
import { renderTemplate, getPlaceholders } from "@/lib/templates/template-engine"

export function TemplateManager({ initialTemplates }: { initialTemplates: any[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [editContent, setEditContent] = useState("")
  const [changelog, setChangelog] = useState("")
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<"list" | "editor">("list")

  // Opens a template in the editor. This previously relied on a useEffect
  // whose actual state update was commented out, so editContent never got
  // (re)initialized when switching templates — the editor would show
  // whatever content was already in state (stale, from whatever template
  // was open before, or blank), and Save Draft would happily persist that
  // stale content as a new version of the *wrong* template. Also, template
  // version history was never actually fetched on open (nothing called
  // getTemplateHistory), so the "unpublished draft" banner never triggered
  // for a draft left over from an earlier session.
  async function openTemplate(t: any) {
    setSelectedTemplate(t)
    setEditContent(t.activeContent || "")
    setChangelog("")
    setHistory([])
    setView("editor")

    try {
      const h = await getTemplateHistory(t.id)
      setHistory(h)
      // If the latest version is an unpublished draft, load its content
      // instead of the published one, so in-progress edits aren't lost.
      if (h[0]?.status === "draft" && h[0]?.content) {
        setEditContent(h[0].content)
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load template history")
    }
  }

  async function handleSaveDraft() {
    if (!changelog) {
      toast.error("Please provide a reason for this update in the changelog.")
      return
    }

    startTransition(async () => {
      try {
        const result = await saveTemplateDraft({
          templateId: selectedTemplate.id,
          content: editContent,
          changelog
        })
        if (result.ok) {
          toast.success("Draft version saved successfully!")
          const updatedHistory = await getTemplateHistory(selectedTemplate.id)
          setHistory(updatedHistory)
          setChangelog("")

          // Force a data refresh to update the list view
          const updatedTemplates = await listTemplates()
          setTemplates(updatedTemplates)
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to save draft")
      }
    })
  }

  async function handleSaveAndPublish() {
    if (!changelog) {
      toast.error("Please provide a reason for this update in the changelog.")
      return
    }

    startTransition(async () => {
      try {
        const result = await saveAndPublishTemplate({
          templateId: selectedTemplate.id,
          content: editContent,
          changelog
        })
        if (result.ok) {
          toast.success("Template saved and published successfully!")
          const updatedHistory = await getTemplateHistory(selectedTemplate.id)
          setHistory(updatedHistory)
          setChangelog("")

          // Force a data refresh to update the list view
          const updatedTemplates = await listTemplates()
          setTemplates(updatedTemplates)
          const current = updatedTemplates.find(t => t.id === selectedTemplate.id)
          setSelectedTemplate(current)
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to save and publish")
      }
    })
  }

  async function handlePublish(versionId: string) {
    if (!confirm("Are you sure you want to publish this version? It will become live immediately.")) return

    startTransition(async () => {
      try {
        const result = await publishTemplateVersion(selectedTemplate.id, versionId)
        if (result.ok) {
          toast.success("Template published successfully")
          // Refresh data
          const updatedTemplates = await listTemplates()
          setTemplates(updatedTemplates)
          const current = updatedTemplates.find(t => t.id === selectedTemplate.id)
          setSelectedTemplate(current)
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to publish")
      }
    })
  }

  if (view === "editor" && selectedTemplate) {
    const placeholders = getPlaceholders(editContent)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView("list")}>
              <LucideArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
              <p className="text-xs text-muted-foreground">{selectedTemplate.code} · v{selectedTemplate.versionNumber}</p>
            </div>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" size="sm" className="gap-2" onClick={handleSaveDraft} disabled={isPending}>
               <Save className="h-4 w-4" /> Save Draft
             </Button>
             <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700" onClick={handleSaveAndPublish} disabled={isPending}>
               <Zap className="h-4 w-4" /> Save & Publish
             </Button>
             <Badge variant="outline" className="bg-primary/5 uppercase">{selectedTemplate.type}</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {history[0]?.status === 'draft' && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-full">
                    <Zap className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">Unpublished Changes Detected</p>
                    <p className="text-xs text-amber-700">You have a draft that is not yet live. Publish it to apply changes.</p>
                  </div>
                </div>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => handlePublish(history[0].id)} disabled={isPending}>
                  Publish Version {history[0].versionNumber}
                </Button>
              </div>
            )}

            <Card>
              <CardHeader className="py-3 bg-muted/20">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code className="h-4 w-4" /> Template Content
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm border-0 rounded-none focus-visible:ring-0"
                  placeholder="Enter template content with {{placeholders}}..."
                />
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Version Changelog</Label>
              <Input
                placeholder="What did you change in this version?"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Braces className="h-4 w-4" /> Placeholders
                </CardTitle>
                <CardDescription className="text-[10px]">Detected variables in this template.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {placeholders.length > 0 ? placeholders.map(p => (
                    <code key={p} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                      {`{{${p}}}`}
                    </code>
                  )) : (
                    <p className="text-xs text-muted-foreground italic">No placeholders detected.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <HistoryIcon className="h-4 w-4" /> Version History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto">
                  {history.map((v) => (
                    <div key={v.id} className="p-3 border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">v{v.versionNumber}</span>
                        <Badge variant={v.status === 'published' ? 'default' : 'secondary'} className="text-[8px] h-4">
                          {v.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{v.changelog}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-muted-foreground/60">{new Date(v.createdAt).toLocaleDateString()}</span>
                        {v.status !== 'published' && (
                          <Button variant="link" className="h-auto p-0 text-[10px]" onClick={() => handlePublish(v.id)} disabled={isPending}>
                            Publish
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="card-accent-blue">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-blue" />
            Enterprise Template Management
          </CardTitle>
          <CardDescription>Single source of truth for all editable communications and documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Active Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-bold">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{t.code}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] uppercase">{t.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {t.type === 'SMS' ? <MessageSquare className="h-3 w-3" /> : <Code className="h-3 w-3" />}
                      {t.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-green-200 text-green-600 bg-green-50 font-bold">
                      v{t.versionNumber}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openTemplate(t)}>
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function LucideArrowLeft(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2008/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}
