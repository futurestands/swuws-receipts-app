"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { getNavSections, isNavItemActive, type NavSection } from "@/lib/nav-config"
import { DynamicIcon } from "./icons"

export function SidebarNav({
  sections,
  collapsed = false,
  onNavigate,
}: {
  sections: NavSection[]
  /** Icon-only rail mode (desktop, collapsed). Never used on mobile. */
  collapsed?: boolean
  /** Called after a link is clicked - used to close the mobile drawer. */
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  // Finding the "Best Match" item among all sections to prevent multiple highlights.
  // We pick the matching item with the longest path (most specific).
  const allItems = sections.flatMap(s => s.items)
  const activeItem = allItems
    .filter(item => isNavItemActive(pathname, item))
    .sort((a, b) => {
      const aPath = a.activeMatch ?? a.href
      const bPath = b.activeMatch ?? b.href
      return bPath.length - aPath.length
    })[0]

  return (
    <nav className="flex flex-col gap-6 px-2 py-4" aria-label="Primary">
      {sections.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-1">
          {section.label && (
            <div className={cn(
              "px-3 pt-2 pb-1 text-[0.65rem] font-black tracking-[0.2em] text-sidebar-foreground/60 uppercase transition-opacity duration-200",
              collapsed ? "sr-only" : "opacity-100"
            )}>
              {section.label}
            </div>
          )}
          {section.items.map((item) => {
            const active = activeItem?.href === item.href

            // Crisp Color Coding for white sidebar
            let iconColor = "text-blue-600"
            if (section.label === "Finance") iconColor = "text-emerald-600"
            if (item.label === "Exceptions") iconColor = "text-red-600"
            if (section.label === "System") iconColor = "text-blue-600"

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-all duration-200",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                {/* Active Accent Bar */}
                {active && !collapsed && (
                  <div className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-primary" />
                )}

                <DynamicIcon
                  name={item.icon}
                  className={cn(
                    "size-4.5 shrink-0 transition-transform group-hover:scale-110",
                    active ? "text-sidebar-primary-foreground" : cn(iconColor, "opacity-90")
                  )}
                  aria-hidden="true"
                />
                <span className={cn(
                  "transition-opacity duration-200 whitespace-nowrap",
                  collapsed ? "sr-only" : "opacity-100"
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export { getNavSections }
