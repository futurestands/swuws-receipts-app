"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  const looksLikeAuthError = /unauthorized|forbidden/i.test(error.message)

  return (
    <div className="py-12 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            {looksLikeAuthError
              ? "Your session may have expired. Please sign in again."
              : "An unexpected error occurred loading this page. Any receipt already saved is unaffected — receipts are immutable once issued."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {looksLikeAuthError ? (
            <Button asChild>
              <Link href="/login">Sign in again</Link>
            </Button>
          ) : (
            <Button onClick={() => reset()}>Try again</Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
