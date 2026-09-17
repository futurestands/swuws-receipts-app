"use client"

import { useEffect } from "react"
import { reportClientError } from "@/app/actions/system-errors"

export function useReportRuntimeError(
  error: Error & { digest?: string },
  source: string
) {
  useEffect(() => {
    console.error(`${source} error:`, error)
    if (/unauthorized|forbidden/i.test(error.message || "")) return
    void reportClientError({
      message: error.message || "Unhandled application error",
      digest: error.digest,
      stack: error.stack,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      source,
    })
  }, [error, source])
}
