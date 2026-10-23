import { describe, it, expect } from "vitest"
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import { DialogTrigger, Dialog } from "./dialog"
import { AlertDialogTrigger, AlertDialog } from "./alert-dialog"
import { DropdownMenuTrigger, DropdownMenu } from "./dropdown-menu"
import { SheetTrigger, Sheet } from "./sheet"
import { Button } from "./button"

describe("Shared Trigger asChild SSR Regression Tests", () => {
  it("DialogTrigger asChild preserves child label in server HTML", () => {
    const html = renderToString(
      createElement(
        Dialog,
        null,
        createElement(
          DialogTrigger,
          { asChild: true },
          createElement("button", { className: "custom-trigger" }, "Open Dialog Custom")
        )
      )
    )
    expect(html).toContain("Open Dialog Custom")
    expect(html).toContain("custom-trigger")
    expect(html).toContain("data-slot=\"dialog-trigger\"")
  })

  it("AlertDialogTrigger asChild preserves child label in server HTML", () => {
    const html = renderToString(
      createElement(
        AlertDialog,
        null,
        createElement(
          AlertDialogTrigger,
          { asChild: true },
          createElement("button", { className: "custom-alert-trigger" }, "Confirm Action")
        )
      )
    )
    expect(html).toContain("Confirm Action")
    expect(html).toContain("custom-alert-trigger")
    expect(html).toContain("data-slot=\"alert-dialog-trigger\"")
  })

  it("DropdownMenuTrigger asChild preserves child label in server HTML", () => {
    const html = renderToString(
      createElement(
        DropdownMenu,
        null,
        createElement(
          DropdownMenuTrigger,
          { asChild: true },
          createElement("button", { className: "custom-dropdown-trigger" }, "Menu Options")
        )
      )
    )
    expect(html).toContain("Menu Options")
    expect(html).toContain("custom-dropdown-trigger")
    expect(html).toContain("data-slot=\"dropdown-menu-trigger\"")
  })

  it("SheetTrigger asChild preserves child label in server HTML", () => {
    const html = renderToString(
      createElement(
        Sheet,
        null,
        createElement(
          SheetTrigger,
          { asChild: true },
          createElement("button", { className: "custom-sheet-trigger" }, "Open Side Panel")
        )
      )
    )
    expect(html).toContain("Open Side Panel")
    expect(html).toContain("custom-sheet-trigger")
    expect(html).toContain("data-slot=\"sheet-trigger\"")
  })

  it("Button asChild preserves child label and element attributes in server HTML", () => {
    const html = renderToString(
      createElement(
        Button,
        { asChild: true, variant: "outline" },
        createElement("a", { href: "/dashboard" }, "Go to Dashboard")
      )
    )
    expect(html).toContain("Go to Dashboard")
    expect(html).toContain("href=\"/dashboard\"")
    expect(html).toContain("data-slot=\"button\"")
  })
})
