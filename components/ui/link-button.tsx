"use client"

import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { DynamicIcon, type IconName } from "@/components/layout/icons"
import { cn } from "@/lib/utils"

export function LinkButton({
  href,
  variant = "default",
  icon,
  children,
  className,
}: {
  href: string
  variant?: "default" | "outline"
  icon?: IconName
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant }), className)}>
      {icon ? <DynamicIcon name={icon} className="mr-2 h-4 w-4" /> : null}
      {children}
    </Link>
  )
}
