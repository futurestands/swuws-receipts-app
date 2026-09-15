import { OfflineWorkspaceClient } from "./OfflineWorkspaceClient"

/**
 * OFFLINE WORKSPACE (SERVICE-WORKER SERVED)
 *
 * Used when the service worker can intercept a failed navigation on the
 * app origin. True airplane-mode cold start still uses public/offline.html
 * via Capacitor server.errorPath; MainActivity injects the SQLite /
 * Bluetooth / TCP plugins onto that local origin so receipts, readings
 * and printing work there too. This page must never depend on server
 * data: no auth gate, no DB reads.
 */
export default function OfflineShellPage() {
  return (
    <div className="container mx-auto py-6">
      <OfflineWorkspaceClient />
    </div>
  )
}
