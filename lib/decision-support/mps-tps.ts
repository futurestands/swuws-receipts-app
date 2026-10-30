/** Original TARGETS GOLBAL model. Analytical results only; never posts bills or production. */
export const MPS_TPS_FORMULA_VERSION = "swuws-original-targets-v1" as const
export type MetricState = "AVAILABLE" | "MISSING" | "SOURCE_ERROR" | "UNRESOLVED_EXTERNAL" | "UNRESOLVED_DEPENDENCY"
export interface EngineeringMetric {
  value: number | null
  state: MetricState
  unit: string
  source: string
  dependencies: string[]
  reason?: string
  savedValue?: number | string | null
}
export function inputMetric(value: number | null, unit: string, source: string): EngineeringMetric {
  return typeof value === "number" && Number.isFinite(value)
    ? { value, state: "AVAILABLE", unit, source, dependencies: [] }
    : { value: null, state: "MISSING", unit, source, dependencies: [], reason: "Required input is missing or nonfinite" }
}
function derive(source: string, unit: string, inputs: EngineeringMetric[], calculate: (values: number[]) => number): EngineeringMetric {
  const dependencies = inputs.map(x => x.source)
  if (inputs.some(x => x.state !== "AVAILABLE" || x.value === null)) {
    return { value: null, state: "UNRESOLVED_DEPENDENCY", source, unit, dependencies, reason: inputs.filter(x => x.state !== "AVAILABLE").map(x => `${x.source}: ${x.reason ?? x.state}`).join("; ") }
  }
  const value = calculate(inputs.map(x => x.value!))
  return Number.isFinite(value) ? { value, state: "AVAILABLE", source, unit, dependencies }
    : { value: null, state: "UNRESOLVED_DEPENDENCY", source, unit, dependencies, reason: "Zero denominator or nonfinite result" }
}
export interface MpsTpsInputs {
  monthlyCapacity: EngineeringMetric
  mpsUtilisation: EngineeringMetric
  tpsUtilisation: EngineeringMetric
  mpsNrw: EngineeringMetric
  tpsNrw: EngineeringMetric
  mpsProduction: EngineeringMetric
  mpsSales: EngineeringMetric
  tariff: EngineeringMetric
  arrears: EngineeringMetric
  collectionEfficiency: EngineeringMetric
}
export interface MpsTpsResult {
  formulaVersion: typeof MPS_TPS_FORMULA_VERSION
  inputs: MpsTpsInputs
  production: EngineeringMetric
  supplied: EngineeringMetric
  sold: EngineeringMetric
  billing: EngineeringMetric
  demand: EngineeringMetric
  productionToSupplyLoss: EngineeringMetric
  productionToSalesLoss: EngineeringMetric
  diagnostics: string[]
  basis: "Original fixed-month workbook targets; reporting year and approval unresolved"
}
export function calculateMpsTps(inputs: MpsTpsInputs, row: number): MpsTpsResult {
  const source = (cell: string) => `TARGETS GOLBAL!${cell}${row}`
  // L=H*F, M=L-5%*L, P=M-25%*M. J is deliberately NOT a dependency of P.
  const production = derive(source("L"), "m3/target-month", [inputs.tpsUtilisation, inputs.monthlyCapacity], ([h, f]) => h * f)
  const supplied = derive(source("M"), "m3/target-month", [production], ([l]) => l - .05 * l)
  const sold = derive(source("P"), "m3/target-month", [supplied], ([m]) => m - .25 * m)
  const billing = derive(source("Q"), "UGX/target-month", [sold, inputs.tariff], ([p, u]) => p * u)
  const demand = derive(source("S"), "UGX", [inputs.arrears, billing], ([r, q]) => r + q)
  const productionToSupplyLoss = derive(`(${source("L")}-${source("M")})/${source("L")}`, "fraction", [production, supplied], ([l, m]) => (l - m) / l)
  const productionToSalesLoss = derive(`(${source("L")}-${source("P")})/${source("L")}`, "fraction", [production, sold], ([l, p]) => (l - p) / l)
  const diagnostics: string[] = []
  if (inputs.tpsNrw.value !== null && productionToSalesLoss.value !== null && Math.abs(inputs.tpsNrw.value - productionToSalesLoss.value) > 1e-10) diagnostics.push("Declared TPS NRW differs from the 5% then 25% target-sales chain; original dependencies retained")
  if ([inputs.mpsNrw, inputs.tpsNrw].some(x => x.value !== null && (x.value < 0 || x.value > 1))) diagnostics.push("Original NRW ratio is outside 0–100%; retained for investigation")
  if (inputs.arrears.state !== "AVAILABLE") diagnostics.push("Total demand unresolved: external arrears evidence is not verified")
  return { formulaVersion: MPS_TPS_FORMULA_VERSION, inputs, production, supplied, sold, billing, demand, productionToSupplyLoss, productionToSalesLoss, diagnostics, basis: "Original fixed-month workbook targets; reporting year and approval unresolved" }
}
/** Complete-population sums only. Callers may present observed subtotals separately. */
export function sumEngineeringMetrics(metrics: EngineeringMetric[], unit: string, source: string): EngineeringMetric {
  if (!metrics.length) return inputMetric(null, unit, source)
  return derive(source, unit, metrics, values => values.reduce((n, v) => n + v, 0))
}

export type UtilisationBand = "unavailable" | "underused" | "healthy" | "optimal" | "stressed" | "critical" | "boundary"
/** GLOBAL SUMMERY!D79:E83. Printed intervals overlap at 75 and 85; do not invent ownership. */
export function classifyUtilisation(percent: number | null): { band: UtilisationBand; label: string } {
  if (percent === null || !Number.isFinite(percent) || percent < 0) return { band: "unavailable", label: "Benchmark unavailable" }
  if (percent === 75 || percent === 85) return { band: "boundary", label: `Boundary review (${percent}%): ${percent === 75 ? "Healthy / Optimal" : "Optimal / Stressed"}` }
  if (percent < 50) return { band: "underused", label: "Underused (<50%)" }
  if (percent < 75) return { band: "healthy", label: "Healthy (50–75%)" }
  if (percent < 85) return { band: "optimal", label: "Optimal (75–85%)" }
  if (percent <= 95) return { band: "stressed", label: "Stressed (85–95%)" }
  return { band: "critical", label: "Critical (>95%)" }
}
