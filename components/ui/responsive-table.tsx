"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { EmptyState, LoadingState } from "@/components/ui/empty-state"

/**
 * Wraps a <Table>...</Table> (unchanged, from components/ui/table) in a
 * consistent bordered container and adds a visual cue - a soft shadow on
 * whichever edge still has content - when the table is wider than its
 * container and horizontally scrollable. The Table primitive already
 * scrolls internally (overflow-x-auto), so this doesn't change scroll
 * *behavior*; it makes the fact that a screen scrolls actually noticeable,
 * which plain overflow-x-auto alone doesn't communicate.
 */
function ScrollableTableContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const updateEdges = useCallback(() => {
    const el = ref.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    updateEdges()
    const el = ref.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateEdges)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [updateEdges])

  return (
    <div
      data-slot="scrollable-table-container"
      className={cn("relative overflow-hidden rounded-xl border", className)}
    >
      <div
        ref={ref}
        onScroll={updateEdges}
        className="overflow-x-auto [&>[data-slot=table-container]]:overflow-visible"
      >
        {children}
      </div>
      {!atStart && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent"
          aria-hidden="true"
        />
      )}
      {!atEnd && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/**
 * Higher-level convenience wrapper: handles the loading / empty / populated
 * three-way branch that nearly every table screen repeats, around a
 * ScrollableTableContainer.
 */
function ResponsiveDataTable({
  loading,
  isEmpty,
  emptyTitle = "No results",
  emptyDescription,
  children,
  className,
}: {
  loading?: boolean
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  children: React.ReactNode
  className?: string
}) {
  if (loading) return <LoadingState variant="table" />
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <ScrollableTableContainer className={className}>{children}</ScrollableTableContainer>
  )
}

export { ScrollableTableContainer, ResponsiveDataTable }
