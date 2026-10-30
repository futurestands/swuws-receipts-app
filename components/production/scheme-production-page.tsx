import Link from "next/link"
import { getSchemeIntelligence } from "@/app/actions/intelligence"
import { requireUser } from "@/lib/session"
import { canViewIntelligence } from "@/lib/permissions"
import { ProductionWorkspace } from "./production-workspace"
import { SchemeDecisionSupportView } from "@/components/decision-support/scheme-decision-support-view"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Activity, Droplets } from "lucide-react"

export default async function SchemeProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()])
  const intelligence = canViewIntelligence(user) ? await getSchemeIntelligence(id) : null
  const schemeName = intelligence?.scheme?.name ?? "Water Scheme"

  return (
    <div className="space-y-6">
      {/* NAVIGATION HEADER */}
      <div className="flex flex-col gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-xs">
            <Link href="/intelligence">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to All Schemes Overview
            </Link>
          </Button>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{schemeName}</h1>
            <p className="text-xs text-muted-foreground">
              Scheme ID: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">{id}</code>
            </p>
          </div>
        </div>
      </div>

      {/* TWO-TAB NAVIGATION LAYOUT (Step 2) */}
      <Tabs defaultValue="production" className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="production" className="text-xs flex items-center gap-2">
            <Droplets className="h-4 w-4" /> Water Production Workspace
          </TabsTrigger>
          <TabsTrigger value="decision-support" className="text-xs flex items-center gap-2">
            <Activity className="h-4 w-4" /> Decision Support & Engineering
          </TabsTrigger>
        </TabsList>

        <TabsContent value="production" className="space-y-6">
          <ProductionWorkspace schemeId={id} />
        </TabsContent>

        <TabsContent value="decision-support" className="space-y-6">
          <SchemeDecisionSupportView schemeId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
