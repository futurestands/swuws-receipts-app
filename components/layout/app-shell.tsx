"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { SignOutButton } from "@/components/sign-out-button"
import type { NavSection } from "@/lib/nav-config"

const COLLAPSE_KEY = "swuws:sidebar-collapsed"

export function AppShell({
  sections,
  userName,
  userRoleLabel,
  developerCredit,
  orgName = "Southwestern Umbrella of Water and Sanitation",
  logoUrl,
  receiptPrefix = "SWUWS",
  brand = "SWUWS Collection Portal",
  brandHref = "/dashboard",
  children,
}: {
  sections: NavSection[]
  userName: string
  userRoleLabel: string
  developerCredit?: string
  orgName?: string
  logoUrl?: string | null
  receiptPrefix?: string
  brand?: string
  brandHref?: string
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(COLLAPSE_KEY)
      return stored === "1"
    }
    return false
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  return (
    <div className="min-h-screen bg-muted/20 md:flex">
      {/* Desktop sidebar */}
      <aside
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 md:flex no-print"
        style={{ width: collapsed ? "4rem" : "13.5rem" }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          <div className="flex flex-col min-w-0">
            {!collapsed ? (
              <Link href={brandHref} className="flex items-center gap-2 group leading-tight overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="size-8 object-contain shrink-0" />
                ) : (
                  <div className="size-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-primary">{receiptPrefix[0]}</span>
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-black text-sidebar-foreground tracking-tight uppercase truncate">
                    {receiptPrefix} Portal
                  </span>
                  <span className="text-[9px] font-bold text-sidebar-foreground/50 uppercase tracking-tighter">
                    Management
                  </span>
                </div>
              </Link>
            ) : (
              <Link href={brandHref} className="flex justify-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="size-6 object-contain" />
                ) : (
                  <div className="size-6 rounded bg-primary/10 flex items-center justify-center">
                    <span className="text-[8px] font-black text-primary">{receiptPrefix[0]}</span>
                  </div>
                )}
              </Link>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav sections={sections} collapsed={collapsed} />
        </div>
        <div className={cn(
          "shrink-0 border-t border-sidebar-border p-3 text-center transition-opacity duration-200",
          collapsed || !developerCredit ? "opacity-0 h-0 p-0 overflow-hidden" : "opacity-100"
        )}>
          {developerCredit && (
            <p className="text-[10px] font-medium text-sidebar-foreground/50 leading-tight">
              &copy; {new Date().getFullYear()} {developerCredit}
            </p>
          )}
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="h-20 flex flex-col items-start justify-center border-b border-sidebar-border px-4">
            <SheetTitle className="text-sidebar-foreground text-left flex flex-col leading-tight">
              <span className="text-sm font-black tracking-tight uppercase">{receiptPrefix} COLLECTION</span>
              <span className="text-sm font-black tracking-tight uppercase">PORTAL</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card/95 px-3 backdrop-blur supports-backdrop-filter:bg-card/80 sm:px-4 md:px-6 no-print">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu />
          </Button>
          <div className="flex flex-col min-w-0 md:hidden leading-tight">
            <Link href={brandHref} className="flex flex-col">
              <span className="text-[11px] font-black text-primary uppercase">{receiptPrefix} COLLECTION</span>
              <span className="text-[11px] font-black text-primary uppercase">PORTAL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center flex-1 px-4 min-w-0 overflow-hidden">
            <p className="w-full text-[10px] md:text-sm lg:text-base xl:text-lg font-black text-brand-blue tracking-[0.1em] text-center italic font-serif whitespace-nowrap overflow-hidden text-ellipsis uppercase">
              {orgName}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NotificationCenter />
            <span className="hidden truncate border-l pl-3 text-sm text-muted-foreground md:inline">
              {userName} · {userRoleLabel}
            </span>
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
