"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { NotificationCenter } from "@/components/notifications/notification-center"
import { SignOutButton } from "@/components/sign-out-button"
import type { NavSection } from "@/lib/nav-config"
import { isNative, setupStatusBar } from "@/lib/mobile-hardware"
import { SyncStatus } from "./SyncStatus"
import { ConnectivityGuard } from "./connectivity-guard"
import { Badge } from "@/components/ui/badge"

const COLLAPSE_KEY = "swuws:sidebar-collapsed"

/** Official letterhead split used on receipts: "… Umbrella" / "of Water and Sanitation". */
function letterheadLines(name: string) {
  const match = name.trim().match(/^(.*?)\s+(of\s+.+)$/i)
  if (!match?.[1] || !match[2]) return null
  return { primary: match[1], secondary: match[2] }
}

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
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [native, setNative] = useState(false)
  const [forcedOffline, setForcedOffline] = useState(false)
  const pathname = usePathname()
  const hideSidebar = pathname.startsWith("/dashboard/offline") || forcedOffline
  const lines = letterheadLines(orgName)

  useEffect(() => {
    // 1. Initial collapsed state from localStorage (prevents hydration mismatch)
    const stored = window.localStorage.getItem(COLLAPSE_KEY)
    if (stored === "1") setCollapsed(true)

    // 2. Native hardware setup
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
          - Offline Mode: no sidebar. Field staff only need search, collect, reading.
      */}
      {!hideSidebar && (
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
            <p className="text-[10px] font-medium text-sidebar-foreground/50 leading-tight" suppressHydrationWarning>
              © {new Date().getFullYear()} {developerCredit}
            </p>
          )}
        </div>
      </aside>
      )}

      {/* Mobile drawer */}
      {!hideSidebar && (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] border-sidebar-border bg-sidebar p-0 flex flex-col h-full overflow-hidden">
          <SheetHeader className="flex flex-col items-start justify-center border-b border-sidebar-border px-4 shrink-0 h-24 pt-[env(safe-area-inset-top)]">
            <SheetTitle className="text-sidebar-foreground text-left flex flex-col leading-tight">
              <span className="text-sm font-black tracking-tight uppercase">{receiptPrefix} COLLECTION</span>
              <span className="text-sm font-black tracking-tight uppercase">PORTAL</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <SidebarNav sections={filteredSections} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 overflow-hidden border-b bg-card/95 px-2 backdrop-blur supports-backdrop-filter:bg-card/80 sm:h-14 sm:gap-3 sm:px-4 md:px-6 no-print pt-[env(safe-area-inset-top)]">
          {hideSidebar ? (
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu />
            </Button>
          )}

          <div className="@container flex min-w-0 flex-1 items-center justify-center overflow-hidden px-1">
            {lines ? (
              <>
                <strong
                  title={orgName}
                  className="md:hidden text-center font-sans font-black uppercase text-brand-blue leading-[1.2] tracking-[0.05em] text-[0.68rem]"
                >
                  <span className="block">{lines.primary}</span>
                  <span className="block">{lines.secondary}</span>
                </strong>
                <strong
                  title={orgName}
                  className="hidden md:block w-full overflow-hidden text-center font-sans font-black uppercase text-brand-blue leading-none tracking-[0.03em] whitespace-nowrap text-[clamp(0.8rem,2.65cqi,1.15rem)]"
                >
                  {orgName}
                </strong>
              </>
            ) : (
              <strong
                title={orgName}
                className="block w-full overflow-hidden text-center font-sans font-black uppercase text-brand-blue leading-tight tracking-[0.03em] max-md:line-clamp-2 md:truncate md:whitespace-nowrap md:leading-none text-[clamp(0.62rem,2.65cqi,1.15rem)]"
              >
                {orgName}
              </strong>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {native && (
               <Badge variant="outline" className="hidden sm:inline-flex shrink-0 text-[8px] h-4 px-1.5 font-black uppercase bg-primary text-white border-none shadow-sm">
                  Mobile App
               </Badge>
            )}
            <SyncStatus agentId={agentId} />
            <NotificationCenter />
            <span className="hidden max-w-[14rem] truncate border-l pl-3 text-sm text-muted-foreground xl:inline 2xl:max-w-none">
              {userName} · {userRoleLabel}
            </span>
            <SignOutButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 overflow-y-auto">
          <ConnectivityGuard agentId={agentId} onForcedOffline={setForcedOffline}>
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </ConnectivityGuard>
        </main>
      </div>
    </div>
  )
}
