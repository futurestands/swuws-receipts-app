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
import { isNative, setupStatusBar } from "@/lib/mobile-hardware"
import { SyncStatus } from "./SyncStatus"
import { Badge } from "@/components/ui/badge"

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
  agentId,
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
  agentId: string
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(COLLAPSE_KEY)
      return stored === "1"
    }
    return false
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [native, setNative] = useState(false)

  useEffect(() => {
    if (isNative()) {
      setNative(true)
      // Initialize system status bar for native app
      setupStatusBar()
    }
  }, [])

  // Filter out minimalist items from sidebar to keep it clean (WhatsApp-style)
  // These are now accessed via the Dashboard (Field Mode) or Account (Printer Settings)
  const filteredSections = sections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      const isHiddenFromSidebar = item.href.includes('/offline') || item.href.includes('/printer')
      return !isHiddenFromSidebar
    })
  })).filter(section => section.items.length > 0)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  return (
    <div className="min-h-screen bg-muted/20 md:flex">
      {/*
          ADAPTIVE SIDEBAR:
          - Mobile (<768px): Hidden, accessed via Sheet drawer.
          - Tablet (768px - 1024px): Navigation Rail (icon-only) by default.
          - Desktop (>1024px): Full Sidebar (expanded or user-collapsed).
      */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex no-print",
          collapsed ? "w-16" : "w-[13.5rem]"
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          <div className="flex flex-col min-w-0">
            {/* Automatic visibility: label is hidden on tablet (md:max-lg) even if 'collapsed' is false */}
            <Link href={brandHref} className="flex items-center gap-2 group leading-tight overflow-hidden">
              {logoUrl && !imgError ? (
                <div className="size-8 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0 border border-black/5 shadow-sm overflow-hidden">
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  <span className="text-[10px] font-black text-primary">{receiptPrefix[0]}</span>
                </div>
              )}
              <div className={cn(
                "flex flex-col min-w-0 transition-opacity duration-300",
                collapsed ? "sr-only" : "opacity-100"
              )}>
                <span className="text-[11px] font-black text-sidebar-foreground tracking-tight uppercase truncate">
                  {receiptPrefix} Portal
                </span>
                <span className="text-[9px] font-bold text-sidebar-foreground/50 uppercase tracking-tighter">
                  Management
                </span>
              </div>
            </Link>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "ml-auto shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-300",
              collapsed ? "rotate-180" : "rotate-0",
              // Hide toggle on pure tablets to keep the "Auto-Rail" clean
              "md:max-lg:hidden"
            )}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav sections={filteredSections} collapsed={collapsed} />
        </div>
        <div className={cn(
          "shrink-0 border-t border-sidebar-border p-3 text-center transition-opacity duration-200",
          collapsed || !developerCredit ? "sr-only h-0 p-0 overflow-hidden" : "opacity-100"
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
            <SidebarNav sections={filteredSections} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn(
          "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card/95 px-3 backdrop-blur supports-backdrop-filter:bg-card/80 sm:px-4 md:px-6 no-print",
          native && "pt-3 h-auto min-h-14"
        )}>
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
              <span className="text-[11px] font-black text-primary uppercase leading-none tracking-tighter">{receiptPrefix}</span>
              <span className="text-[8px] font-bold text-primary/60 uppercase leading-none">PORTAL</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center flex-1 px-20 min-w-0 justify-center gap-2">
            <p className="text-[10px] md:text-sm lg:text-base xl:text-lg font-black text-brand-blue tracking-[0.15em] text-center font-serif uppercase whitespace-nowrap">
              {orgName}
            </p>
            {native && (
               <Badge variant="outline" className="text-[8px] h-4 px-1.5 font-black uppercase bg-primary text-white border-none shadow-sm">
                  Mobile App
               </Badge>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <SyncStatus agentId={agentId} />
            <NotificationCenter />
            <span className="hidden truncate border-l pl-3 text-sm text-muted-foreground md:inline">
              {userName} · {userRoleLabel}
            </span>
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
