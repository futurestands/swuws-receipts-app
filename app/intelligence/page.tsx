import { requireUser } from "@/lib/session"
import { canViewIntelligence } from "@/lib/permissions"
import { ProductionWorkspace } from "@/components/production/production-workspace"
import IntelligenceDashboard from "./intelligence-dashboard"

export default async function IntelligencePage() {
  const user = await requireUser()
  return <div className="space-y-6"><ProductionWorkspace />{canViewIntelligence(user) && <IntelligenceDashboard />}</div>
}
