"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error)
  }, [error])

  const looksLikeAuthError = /unauthorized|forbidden/i.test(error.message)

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            {looksLikeAuthError
              ? "Your session may have expired. Please sign in again."
              : "An unexpected error occurred. Nothing was lost — any receipt you were creating is still immutable and safe if it was already saved."}
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
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
