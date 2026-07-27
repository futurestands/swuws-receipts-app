import { adminExistsPublic } from "@/app/actions/bootstrap"
import { LoginForm } from "@/app/login/login-form"
import { SetupForm } from "@/app/login/setup-form"

export const dynamic = "force-dynamic"

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
    <>
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
    </>
  )
}
