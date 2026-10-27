import { getSchemeIntelligence } from "@/app/actions/intelligence"
import { requireUser } from "@/lib/session"
import { canViewIntelligence } from "@/lib/permissions"
import { ProductionWorkspace } from "./production-workspace"

export default async function SchemeProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()])
  const intelligence = canViewIntelligence(user) ? await getSchemeIntelligence(id) : null
  return <div className="space-y-6"><ProductionWorkspace schemeId={id} />{intelligence && <section className="space-y-3"><h2 className="text-xl font-semibold">Scheme decision support findings</h2>{intelligence.findings.length ? intelligence.findings.map(f => <article className="rounded border p-3" key={f.id}><h3 className="font-semibold">{f.title}</h3><p>{f.description}</p><p>{f.recommendation}</p></article>) : <p>No active findings.</p>}</section>}</div>
}
