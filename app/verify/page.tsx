import { VerifyForm } from "@/app/verify/verify-form"

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string }>
}) {
  const { number } = await searchParams

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Receipt Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            South Western Umbrella of Water and Sanitation
          </p>
        </div>
        <VerifyForm initialReceiptNumber={number} />
      </div>
    </div>
  )
}
