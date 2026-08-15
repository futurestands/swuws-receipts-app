import { LogsClient } from "./LogsClient"

export const dynamic = "force-dynamic"

export default function OfflineLogsPage() {
  return (
    <div className="container mx-auto py-6">
      <LogsClient />
    </div>
  )
}
