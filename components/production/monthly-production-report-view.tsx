"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { MonthlyProductionReportOutput } from "@/lib/reports/production-executive-report"

function fmtNum(value: number, decimals = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtUgx(value: number): string {
  return `UGX ${Math.round(value).toLocaleString()}`
}

export function MonthlyProductionReportView({ report }: { report: MonthlyProductionReportOutput }) {
  const { totals } = report
  const allAllocations = report.items.flatMap((item) =>
    item.estimatedAllocation.records.map((rec) => ({
      schemeName: item.schemeName,
      branchName: item.branchName,
      clusterName: item.clusterName,
      ...rec,
    })),
  )

  return (
    <div className="space-y-6 print:space-y-4" aria-label="Monthly production and energy report preview">
      {/* Header & Scope Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">
                SWUWS Monthly Water Production &amp; Energy Performance — {report.reportingMonth}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Scope: <strong>{report.scope}</strong> | Billing Period Match:{" "}
                <strong>{report.billingPeriodMatch}</strong> | Generated:{" "}
                {new Date(report.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="default">Complete: {totals.completeSchemesCount}</Badge>
              <Badge variant="secondary">Partial: {totals.partialSchemesCount}</Badge>
              <Badge variant="outline">Unavailable: {totals.unavailableSchemesCount}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded border p-3 text-xs space-y-1">
              <p className="font-semibold uppercase text-muted-foreground">Verified Measured Water</p>
              <p className="text-base font-bold">
                {totals.totalSchemes === totals.unavailableSchemesCount && totals.totalSchemes > 0
                  ? "UNAVAILABLE"
                  : `${fmtNum(totals.totalVerifiedProducedM3)} m³`}
              </p>
              <p className="text-muted-foreground">
                Source-day completeness: <strong>{totals.overallCompletenessPercent}%</strong> across{" "}
                {totals.totalSchemes} scheme(s)
              </p>
            </div>

            <div className="rounded border p-3 text-xs space-y-1">
              <p className="font-semibold uppercase text-muted-foreground">Billed Metered &amp; NRW</p>
              <p className="text-base font-bold">
                {totals.totalBilledConsumptionM3 !== null
                  ? `${fmtNum(totals.totalBilledConsumptionM3)} m³ billed`
                  : "Billed Volume: UNAVAILABLE"}
              </p>
              <p className="text-muted-foreground">
                Overall NRW:{" "}
                <strong>
                  {totals.overallNrwStatus === "AVAILABLE" && totals.overallNrwPercent !== null
                    ? `${totals.overallNrwPercent}%`
                    : "UNAVAILABLE (strict boundary check)"}
                </strong>
              </p>
            </div>

            <div className="rounded border p-3 text-xs space-y-1">
              <p className="font-semibold uppercase text-muted-foreground">Measured Energy (In-Month)</p>
              <p className="text-base font-bold">{fmtNum(totals.totalMeasuredElectricityKwh)} kWh</p>
              <p className="text-muted-foreground">
                Reconciled generator fuel: <strong>{fmtNum(totals.totalMeasuredFuelLitres)} L</strong>
              </p>
            </div>

            <div className="rounded border p-3 text-xs space-y-1">
              <p className="font-semibold uppercase text-muted-foreground">Energy OpEx &amp; Provisional</p>
              <p className="text-base font-bold">{fmtUgx(totals.totalMeasuredEnergyCostUgx)}</p>
              <p className="text-muted-foreground">
                Provisional unverified: <strong>{totals.totalProvisionalRecordsCount}</strong> | Purchase-only fuel logs:{" "}
                <strong>{totals.totalUnreconciledFuelLogsCount}</strong> ({fmtUgx(totals.totalUnreconciledFuelExpenditureUgx)})
              </p>
            </div>
          </div>

          <div className="rounded border bg-muted/30 p-3 text-xs space-y-1">
            <p>
              <strong>NRW Methodology ({report.nrwMethodology.basis}):</strong> {report.nrwMethodology.caveat}
            </p>
            <p className="text-muted-foreground">
              <strong>Export &amp; PDF Infrastructure Note:</strong> Multi-sheet Excel export (<code>.xlsx</code>) and
              browser Print / Save-as-PDF are active. Dedicated server-side PDF rendering is not yet installed in this
              build; use <em>Print / Save PDF</em> for formatted print output or <em>Export Excel</em> for full audit
              tables.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scheme-by-Scheme Measured, Provisional, Missing, Energy & NRW Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Scheme Performance — Verified Measured Actuals, Missing Data, Energy, OpEx &amp; Gated NRW
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No authorised water schemes matched the selected filter criteria.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 text-[11px]">
                    <TableHead>Cluster / Area / Scheme</TableHead>
                    <TableHead>Data Quality &amp; Missing Days</TableHead>
                    <TableHead>Verified Measured Water (m³)</TableHead>
                    <TableHead>Provisional (Unverified)</TableHead>
                    <TableHead>Billed Metered &amp; NRW</TableHead>
                    <TableHead>Grid Electricity &amp; kWh/m³</TableHead>
                    <TableHead>Generator Fuel &amp; L/m³</TableHead>
                    <TableHead>Energy OpEx (UGX)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.items.map((item) => {
                    const hasProvisional =
                      item.provisionalDailyCount > 0 ||
                      item.provisionalIntervalCount > 0 ||
                      item.energy.provisionalElectricityCount > 0 ||
                      item.energy.provisionalFuelCount > 0
                    return (
                      <TableRow key={item.schemeId} className="align-top text-xs">
                        <TableCell className="space-y-0.5">
                          <p className="font-semibold">{item.schemeName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.clusterName} / {item.branchName}
                          </p>
                        </TableCell>

                        <TableCell className="space-y-1">
                          <Badge
                            variant={
                              item.dataQualityStatus === "COMPLETE"
                                ? "default"
                                : item.dataQualityStatus === "PARTIAL"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {item.dataQualityStatus} ({item.completenessPercent}%)
                          </Badge>
                          <p className="text-[11px]">
                            Verified: <strong>{item.verifiedSourceDays}</strong> / {item.requiredSourceDays} source-days
                          </p>
                          {item.missingSourceDays > 0 && (
                            <p className="text-[11px] text-amber-700">
                              Missing: <strong>{item.missingSourceDays}</strong> source-days (not zero)
                            </p>
                          )}
                          {item.intervalConflictCount > 0 && (
                            <p className="text-[11px] text-destructive">
                              Excluded conflicts: {item.intervalConflictCount} ({fmtNum(item.excludedConflictedIntervalM3)} m³)
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="space-y-0.5">
                          {item.dataQualityStatus === "UNAVAILABLE" ? (
                            <p className="font-semibold text-muted-foreground">UNAVAILABLE (no verified records)</p>
                          ) : (
                            <>
                              <p className="font-semibold">{fmtNum(item.verifiedProducedM3)} m³</p>
                              <p className="text-[11px] text-muted-foreground">
                                Daily: {fmtNum(item.dailyVerifiedProducedM3)} m³ | Intervals:{" "}
                                {fmtNum(item.intervalMeasuredProducedM3)} m³
                              </p>
                            </>
                          )}
                          <p className="text-[11px]">
                            Supplied:{" "}
                            {item.verifiedSuppliedM3 !== null
                              ? `${fmtNum(item.verifiedSuppliedM3)} m³`
                              : "UNAVAILABLE"}
                          </p>
                        </TableCell>

                        <TableCell className="space-y-0.5 text-[11px]">
                          {!hasProvisional ? (
                            <span className="text-muted-foreground">None</span>
                          ) : (
                            <>
                              {item.provisionalDailyCount > 0 && (
                                <p className="text-amber-700">
                                  Daily: {fmtNum(item.provisionalProducedM3)} m³ ({item.provisionalDailyCount})
                                </p>
                              )}
                              {item.provisionalIntervalCount > 0 && (
                                <p className="text-amber-700">
                                  Intervals: {fmtNum(item.provisionalIntervalTotalM3)} m³ ({item.provisionalIntervalCount})
                                </p>
                              )}
                              {item.energy.provisionalElectricityCount > 0 && (
                                <p className="text-amber-700">
                                  Elec: {fmtNum(item.energy.provisionalElectricityKwh)} kWh ({item.energy.provisionalElectricityCount})
                                </p>
                              )}
                              {item.energy.provisionalFuelCount > 0 && (
                                <p className="text-amber-700">
                                  Fuel: {item.energy.provisionalFuelCount} unverified
                                </p>
                              )}
                            </>
                          )}
                        </TableCell>

                        <TableCell className="space-y-1">
                          <p>
                            Billed:{" "}
                            <strong>
                              {item.billedConsumptionM3 !== null
                                ? `${fmtNum(item.billedConsumptionM3)} m³`
                                : "UNAVAILABLE"}
                            </strong>
                          </p>
                          {item.nrwStatus === "AVAILABLE" && item.nrwPercent !== null ? (
                            <Badge variant="default">NRW: {item.nrwPercent}%</Badge>
                          ) : (
                            <div className="space-y-0.5">
                              <Badge variant="outline">NRW: UNAVAILABLE</Badge>
                              {item.nrwUnavailableReasons.length > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                  {item.nrwUnavailableReasons.join("; ")}
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="space-y-0.5">
                          <p>
                            <strong>
                              {item.energy.electricityCoverageComplete || item.energy.totalKwh > 0
                                ? `${fmtNum(item.energy.totalKwh)} kWh`
                                : "UNAVAILABLE"}
                            </strong>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Ratio:{" "}
                            {item.energy.kwhPerM3 !== null ? `${item.energy.kwhPerM3} kWh/m³` : "UNAVAILABLE"}
                          </p>
                        </TableCell>

                        <TableCell className="space-y-0.5">
                          <p>
                            <strong>
                              {item.energy.fuelCoverageComplete || item.energy.totalFuelLitres > 0
                                ? `${fmtNum(item.energy.totalFuelLitres)} L`
                                : "UNAVAILABLE"}
                            </strong>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Ratio: {item.energy.fuelPerM3 !== null ? `${item.energy.fuelPerM3} L/m³` : "UNAVAILABLE"}
                          </p>
                          {item.energy.fuelUnavailableCount > 0 && (
                            <p className="text-[10px] text-amber-700">
                              +{item.energy.fuelUnavailableCount} purchase-only log(s) — consumption UNKNOWN
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="space-y-0.5">
                          <p>
                            <strong>
                              {item.energy.electricityCoverageComplete ||
                              item.energy.fuelCoverageComplete ||
                              item.energy.totalEnergyCostUgx > 0
                                ? fmtUgx(item.energy.totalEnergyCostUgx)
                                : "UNAVAILABLE"}
                            </strong>
                          </p>
                          {item.energy.fuelUnreconciledExpenditureUgx > 0 && (
                            <p className="text-[10px] text-amber-700">
                              Unreconciled fuel spend: {fmtUgx(item.energy.fuelUnreconciledExpenditureUgx)}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Separate Cross-Month Estimated Allocations Table */}
      <Card className="border-amber-500/40">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Estimated Cross-Month Allocations (ESTIMATED_ALLOCATION — Separate from Measured Actuals)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Verified intervals spanning a month boundary retain their genuine measured total and report any single-month share separately with its assumption and error bound.
              </p>
            </div>
            <Badge variant="outline">
              {totals.estimatedAllocation.present
                ? `${allAllocations.length} Cross-Month Record(s)`
                : "No Cross-Month Allocations"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!totals.estimatedAllocation.present ? (
            <p className="text-xs text-muted-foreground">
              All verified records touching {report.reportingMonth} lie wholly inside the calendar month (MEASURED_ONLY).
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs">
                Total separate estimated shares for {report.reportingMonth}: Water{" "}
                <strong>{fmtNum(totals.estimatedAllocation.producedM3)} m³</strong> | Electricity{" "}
                <strong>{fmtNum(totals.estimatedAllocation.electricityKwh)} kWh</strong> (
                {fmtUgx(totals.estimatedAllocation.electricityCostUgx)}) | Generator Fuel{" "}
                <strong>{fmtNum(totals.estimatedAllocation.fuelLitres)} L</strong> (
                {fmtUgx(totals.estimatedAllocation.fuelExpenditureUgx)}).
              </p>
              <div className="overflow-x-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 text-[11px]">
                      <TableHead>Scheme</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Genuine Measured Interval Total</TableHead>
                      <TableHead>Estimated Share ({report.reportingMonth})</TableHead>
                      <TableHead>Method &amp; Fraction</TableHead>
                      <TableHead>Max Absolute Error (±)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allAllocations.map((rec) => (
                      <TableRow key={`${rec.kind}:${rec.recordId}`} className="text-xs">
                        <TableCell>
                          <strong>{rec.schemeName}</strong>
                          <span className="block text-[10px] text-muted-foreground">
                            {rec.clusterName} / {rec.branchName}
                          </span>
                        </TableCell>
                        <TableCell>{rec.kind}</TableCell>
                        <TableCell className="font-semibold">
                          {rec.measuredTotal} {rec.unit}
                        </TableCell>
                        <TableCell className="font-semibold text-amber-800 dark:text-amber-300">
                          {rec.allocatedToMonth} {rec.unit}
                        </TableCell>
                        <TableCell className="text-[11px]">
                          <code>{rec.method}</code> ({rec.fraction.numerator}/{rec.fraction.denominator})
                        </TableCell>
                        <TableCell className="text-[11px]">
                          ±{rec.maxAbsoluteError} {rec.unit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
