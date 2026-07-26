import { cn } from "@/lib/utils"

/**
 * Field grid for a form: single column on mobile, opens up to `columns` on
 * sm+ so related short fields (e.g. city / state / zip) can sit side by
 * side without being forced into a single column on desktop or squeezed on
 * mobile. Individual fields can span the full row with `className="sm:col-span-2"` etc.
 */
function ResponsiveFormLayout({
  children,
  columns = 2,
  className,
}: {
  children: React.ReactNode
  columns?: 1 | 2 | 3
  className?: string
}) {
  const colsClass = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns]

  return (
    <div
      data-slot="form-layout"
      className={cn("grid grid-cols-1 gap-4", colsClass, className)}
    >
      {children}
    </div>
  )
}

/** A single labeled field, consistent spacing between label/control/help text. */
function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Sticky-ish footer action row for a form: stacks full-width on mobile, right-aligned on desktop. */
function FormActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end",
        className
      )}
    >
      {children}
    </div>
  )
}

export { ResponsiveFormLayout, FormField, FormActions }
