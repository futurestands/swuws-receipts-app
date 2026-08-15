import { requireUser } from "@/lib/session"
import { OfflineSearchClient } from "./OfflineSearchClient"

export const dynamic = "force-dynamic"

export default async function OfflineSearchPage() {
  const current = await requireUser()

  return (
    <div className="container mx-auto py-6">
      <OfflineSearchClient agentId={current.id} />
    </div>
  )
}
