import { adminExistsPublic } from "@/app/actions/bootstrap"
import { LoginForm } from "@/app/login/login-form"
import { SetupForm } from "@/app/login/setup-form"

export default async function LoginPage() {
  let hasAdmin = false
  let dbError = null

  try {
    hasAdmin = await adminExistsPublic()
  } catch (e) {
    console.error("LoginPage: Database check failed", e)
    dbError = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">SWUWS Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            South Western Umbrella of Water and Sanitation
          </p>
        </div>
        {dbError ? (
          <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-md text-destructive text-sm">
            <p className="font-bold mb-1">Database Connection Error</p>
            <p>{dbError}</p>
            <p className="mt-2 text-xs opacity-70">
              Please check your DATABASE_URL in .env and ensure your database is reachable.
            </p>
          </div>
        ) : hasAdmin ? (
          <LoginForm />
        ) : (
          <SetupForm />
        )}
      </div>
    </div>
  )
}
