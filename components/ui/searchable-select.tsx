"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDownIcon, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export type SearchableSelectOption = { value: string; label: string }

export const SearchableSelect = React.forwardRef<
  HTMLButtonElement,
  {
    value?: string
    onValueChange: (value: string) => void
    options: SearchableSelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    className?: string
    id?: string
  }
>(function SearchableSelect(
  {
    value,
    onValueChange,
    options,
    placeholder = "Select...",
    searchPlaceholder = "Type to search...",
    emptyText = "No match",
    disabled,
    className,
    id,
  },
  forwardedRef,
) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const setTriggerRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      if (typeof forwardedRef === "function") forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  const selected = options.find((o) => o.value === value)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function placeMenu() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  function toggle() {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    placeMenu()
    setQuery("")
    setOpen(true)
  }

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onReposition = () => placeMenu()
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
      clearTimeout(t)
    }
  }, [open])

  return (
    <>
      <button
        ref={setTriggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggle}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted-foreground")}>
          {selected?.label || placeholder}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="z-[200] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 192),
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 border-b px-2 py-1">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    e.stopPropagation()
                    if (query.trim() && filtered[0]) {
                      onValueChange(filtered[0].value)
                      setOpen(false)
                    }
                  }
                }}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyText}</p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    className={cn(
                      "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      o.value === value && "bg-muted font-medium",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onValueChange(o.value)
                      setOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})
