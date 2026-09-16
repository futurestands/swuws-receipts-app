export type PrinterKind = "thermal" | "office" | "unknown"

const OFFICE_BRANDS =
  /\b(hp|hewlett[-\s]?packard|epson|kyocera|canon|brother|ricoh|xerox|lexmark|konica|minolta|sharp|okidata|pantum|samsung)\b/i

const THERMAL_BRANDS =
  /\b(xprinter|xp-|rongta|pos-|star\s?micronics|bixolon|citizen|gprinter|hprt|sunmi|zebra\s?zq|tm-t|tm-m|receipt|thermal)\b/i

export function classifyPrinterKind(input: {
  name?: string | null
  bluetooth?: boolean
  port9100?: boolean
  port631?: boolean
}): PrinterKind {
  if (input.bluetooth) return "thermal"

  const name = (input.name || "").trim()
  if (name && THERMAL_BRANDS.test(name)) return "thermal"
  if (name && OFFICE_BRANDS.test(name)) return "office"

  // IPP (631) is how HP / Epson / Kyocera advertise themselves on a LAN.
  // A thermal roll printer almost never opens that port.
  if (input.port631) return "office"
  if (input.port9100) return "thermal"
  return "unknown"
}

export function printerKindLabel(kind: PrinterKind | string | null | undefined) {
  if (kind === "office") return "Office printer (A4)"
  if (kind === "thermal") return "Receipt printer (roll)"
  return "Not classified"
}
