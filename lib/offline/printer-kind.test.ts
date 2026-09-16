import { describe, expect, it } from "vitest"
import { classifyPrinterKind } from "./printer-kind"

describe("classifyPrinterKind", () => {
  it("treats Bluetooth as a thermal receipt printer", () => {
    expect(classifyPrinterKind({ bluetooth: true, port631: true })).toBe("thermal")
  })

  it("recognises HP / Epson / Kyocera by name", () => {
    expect(classifyPrinterKind({ name: "HP LaserJet Pro" })).toBe("office")
    expect(classifyPrinterKind({ name: "EPSON L3250" })).toBe("office")
    expect(classifyPrinterKind({ name: "Kyocera ECOSYS" })).toBe("office")
  })

  it("recognises common thermal brands by name", () => {
    expect(classifyPrinterKind({ name: "Xprinter XP-58" })).toBe("thermal")
    expect(classifyPrinterKind({ name: "Sunmi" })).toBe("thermal")
  })

  it("uses IPP port 631 as office when the name is unknown", () => {
    expect(classifyPrinterKind({ port631: true, port9100: true })).toBe("office")
  })

  it("uses port 9100 only as thermal when the name is unknown", () => {
    expect(classifyPrinterKind({ port9100: true })).toBe("thermal")
  })
})
