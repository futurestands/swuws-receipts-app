/**
 * app/login/page.tsx does an async DB check (adminExistsPublic) before it
 * can decide whether to show the login form or the first-run setup form.
 * No loading state existed for this, so anyone loading the app fresh -
 * including every install of the Android app that isn't already
 * logged in - saw a blank screen for however long that check took.
 */
export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#2c4a5e]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        <p className="text-sm font-medium text-white/90">Loading SWUWS Portal…</p>
      </div>
    </div>
  )
}
