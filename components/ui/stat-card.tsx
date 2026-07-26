import type { LucideIcon } from "lucide-react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type StatCardProps = {
  label: string
  value: React.ReactNode
  /** Small icon shown top-right of the card. Optional. */
  icon?: LucideIcon
  /** e.g. "+4.2%" or "-3 today" - rendered with an up/down arrow. */
  trend?: { value: string; direction: "up" | "down" | "neutral" }
  description?: React.ReactNode
  className?: string
  /** Brand color accent for the top border and icon background */
  brandColor?: "blue" | "green" | "red" | "yellow"
}

/**
 * A single metric tile. Used both as a plain "StatCard" (label + value) and
 * as a richer "MetricCard" (adding an icon and/or trend) - same component,
 * the extra props are simply optional, so screens that only need the basic
 * form don't have to import a second, near-identical component.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  description,
  className,
  brandColor,
}: StatCardProps) {
  const accentClass = brandColor ? `card-accent-${brandColor}` : ""

  const iconBgClass = brandColor === "blue" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" :
                     brandColor === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" :
                     brandColor === "red" ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" :
                     brandColor === "yellow" ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400" :
                     "bg-primary/10 text-primary"

  return (
    <Card className={cn("gap-2", accentClass, className)} data-slot="stat-card">
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                trend.direction === "down" && "text-destructive",
                trend.direction === "neutral" && "text-muted-foreground"
              )}
            >
              {trend.direction === "up" && <ArrowUp className="size-3" />}
              {trend.direction === "down" && <ArrowDown className="size-3" />}
              {trend.value}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("rounded-lg p-2", iconBgClass)}>
            <Icon className="size-4" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Alias - same component, named to match the "MetricCard" usage some screens expect. */
const MetricCard = StatCard

/** A responsive grid for laying out a row of StatCards: 1 col mobile, 2 tablet, up to 4 desktop. */
function StatCardGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="stat-card-grid"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4", className)}
    >
      {children}
    </div>
  )
}

export { StatCard, MetricCard, StatCardGrid }
