/**
 * Root-level loading fallback. app/page.tsx does a session check then
 * redirects to /login or /dashboard — nothing else on this route renders
 * a sidebar or layout chrome yet, so this can't reuse the dashboard/admin
 * skeleton components; it needs to stand alone. This is also the exact
 * screen the Android app boots into on launch, so a blank white gap here
 * is the single worst place in the app for one to exist.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2c4a5e]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        <p className="text-sm font-medium text-white/90">Loading SWUWS Portal…</p>
      </div>
    </div>
  )
}
