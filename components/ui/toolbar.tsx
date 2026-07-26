import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

/**
 * A static row above a table/list: a left slot (title, count, view toggle)
 * and a right slot (primary actions). Stacks to two lines on narrow
 * screens instead of compressing both sides together.
 */
function ResponsiveToolbar({
  left,
  right,
  className,
}: {
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {left && <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>}
      {right && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{right}</div>}
    </div>
  )
}

/**
 * Contextual bar for bulk actions on a selection (e.g. "3 selected -
 * Approve / Reject"). Distinct from ResponsiveToolbar: this only renders
 * when `count > 0`, and always includes a way to clear the selection.
 */
function ResponsiveActionBar({
  count,
  onClear,
  actions,
  className,
}: {
  count: number
  onClear: () => void
  actions: React.ReactNode
  className?: string
}) {
  if (count <= 0) return null

  return (
    <div
      data-slot="action-bar"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm",
        className
      )}
    >
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
        <X />
      </Button>
      <span className="text-sm font-medium text-foreground">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

export { ResponsiveToolbar, ResponsiveActionBar }
