export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">SWUWS Collection Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            South Western Umbrella of Water and Sanitation
          </p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Developed by Mugarura Johnson IT
        </p>
      </div>
    </div>
  )
}
