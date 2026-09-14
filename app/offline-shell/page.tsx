import { OfflineWorkspaceClient } from "./OfflineWorkspaceClient"

/**
 * OFFLINE WORKSPACE (SERVICE-WORKER SERVED)
 *
 * This route exists because a page loaded through Capacitor's
 * `server.errorPath` (public/offline.html) never receives the native
 * bridge: Bridge.loadWebView() registers the bridge script with
 * addDocumentStartJavaScript scoped to the origin of `server.url` (the
 * remote app origin) and then drops the JSInjector, and
 * WebViewLocalServer.handleLocalRequest() returns error-URL responses
 * before the HTML-injection branch. So `window.Capacitor` — and therefore
 * CapacitorSQLite — is unavailable there, and the local cache is
 * unreachable from that shell.
 *
 * This page is served from the app origin, where the bridge IS injected,
 * so the existing SQLite-backed offline UI works. The service worker
 * precaches it and serves it for failed navigations. It must never depend
 * on server data: no auth gate, no DB reads.
 */
export default function OfflineShellPage() {
  return (
    <div className="container mx-auto py-6">
      <OfflineWorkspaceClient />
    </div>
  )
}
