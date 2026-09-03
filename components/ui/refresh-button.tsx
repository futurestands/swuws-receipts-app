"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Button } from "./button"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-9 gap-2", className)}
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
    >
      <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
      {isPending ? "Refreshing..." : "Refresh Status"}
    </Button>
  )
}
