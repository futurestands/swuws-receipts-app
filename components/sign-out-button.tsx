"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Sign out"
      className="px-2 sm:px-3"
      onClick={async () => {
        await signOut()
        router.push("/login")
        router.refresh()
      }}
    >
      <LogOut className="size-4 sm:hidden" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  )
}
