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
          <div className="mt-8 text-center space-y-1">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} {settings.developerCredit}
            </p>
            <p className="text-[10px] text-muted-foreground/60 font-mono">
              Build: {process.env.NEXT_PUBLIC_BUILD_SHA} &middot; {process.env.NEXT_PUBLIC_BUILD_TIME ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
