import { describe,expect,it } from "vitest"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import * as XLSX from "xlsx"
import register from "./historical-mapping-register.json"

describe("record-level historical mapping evidence",()=>{
 it("uses the unchanged original workbook hash",()=>expect(createHash("sha256").update(readFileSync(register.summary.workbook)).digest("hex")).toBe(register.summary.workbookSha256))
 it("accounts for every source, scheme and month-label relationship",()=>{
  expect(register.sourceAssessments).toHaveLength(92);expect(register.schemeAssessments).toHaveLength(64);expect(register.schemeMappings).toHaveLength(64);expect(register.periodRelationships).toHaveLength(192)
  const membership=register.schemeAssessments.flatMap(s=>s.sourceReferences)
  expect(new Set(membership).size).toBe(92)
  expect(new Set(membership)).toEqual(new Set(register.sourceAssessments.map(s=>s.referenceId)))
 })
 it("assigns no guessed assessment date, year, live source ID or billing period",()=>{
  expect(register.sourceAssessments.every(s=>s.assessmentDate===null&&s.effectiveFrom===null&&s.responsibleOfficerId===null&&s.databaseSourceId===null)).toBe(true)
  expect(register.schemeMappings.every(s=>s.assessmentDate===null&&s.reportingYear===null&&s.billingPeriodId===null&&s.historicalBackfillEligible===false)).toBe(true)
  expect(register.periodRelationships.every(s=>s.year===null&&s.databaseBillingPeriodId===null&&s.historicalBackfillEligible===false)).toBe(true)
 })
 it("keeps name candidates distinct from approved identity mappings",()=>{
  expect(register.summary.identityCandidateCounts).toEqual({NAME_AND_HIERARCHY_CANDIDATE_NOT_APPROVED:54,MANUAL_IDENTITY_INVESTIGATION:8,HIERARCHY_CONFLICT:2})
  expect(register.schemeMappings.every(s=>s.approvedDatabaseMappingId===null)).toBe(true)
  for(const name of ["Mayanga","Itojo"])expect(register.schemeMappings.find(s=>s.schemeName.trim()===name)?.identityStatus).toBe("HIERARCHY_CONFLICT")
 })
 it("does not map Karukara to Karenga-Myambi or split the Isingiro combined baseline",()=>{
  const karukara=register.schemeMappings.find(s=>s.schemeName==="Karukara")!
  expect(karukara.databaseCandidateId).toBeNull()
  expect(karukara.investigationOnlyCandidates.map(c=>c.name)).toEqual(["KARUKARA- HAMURWA"])
  const combined=register.schemeMappings.find(s=>s.schemeName==="Isingiro T/C & Kyakabindi")!
  expect(combined.databaseCandidateId).toBeNull();expect(combined.investigationOnlyCandidates).toHaveLength(2)
 })
 it("retains blank September and partial July/August observations without inventing zeroes",()=>{
  expect(register.periodRelationships.filter(p=>p.periodLabel==="September").every(p=>p.production.value===null&&p.sold.value===null)).toBe(true)
  expect(register.summary.periodCounts.July).toEqual({rows:64,nonblankProduction:61,nonblankSales:62})
  expect(register.summary.periodCounts.August).toEqual({rows:64,nonblankProduction:63,nonblankSales:63})
 })
 it("preserves every source input/formula cell against a fresh workbook read",()=>{
  const wb=XLSX.readFile(register.summary.workbook,{cellFormula:true})
  for(const s of register.sourceAssessments)for(const f of Object.values(s.fields)){
   const cell=wb.Sheets[f.sheet][f.cell]
   expect(f.value).toEqual(cell?.t==="e"?cell.w:cell?.v??null)
   expect(f.formula).toEqual(cell?.f?"="+cell.f:null)
  }
 })
 it("keeps aggregated source cells, missing source eyes and as-written formula conflicts visible",()=>{
  expect(register.sourceAssessments.find(s=>s.sheet==="KIGEZI"&&s.row===5)?.flags).toContain("hourly_cell_combines_multiple_source_rows_do_not_duplicate")
  expect(register.sourceAssessments.find(s=>s.sheet==="ANKOLE"&&s.row===19)?.flags).toContain("second_borehole_yield_and_regime_missing_zero_formula_is_not_measurement")
  expect(register.sourceAssessments.find(s=>s.sheet==="ISINGIRO"&&s.row===11)?.flags).toContain("scheme_formula_uses_K11_instead_of_L11_dimensional_conflict")
 })
})
