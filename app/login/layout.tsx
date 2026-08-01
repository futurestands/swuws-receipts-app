import { getSettings } from "@/app/actions/settings"

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const settings = await getSettings()

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">{settings.receiptPrefix} Collection Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {settings.orgName}
          </p>
        </div>
        {children}
        {settings.developerCredit && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {settings.developerCredit}
          </p>
        )}
      </div>
    </div>
  )
}
