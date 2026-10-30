// Synthetic-only evidence. Application DB is mocked before imports; no business URL is used.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import JSZip from "jszip"
const runtime=vi.hoisted(()=>({database:undefined as unknown}))
vi.mock("@/lib/db",()=>({get db(){return runtime.database}}))
vi.mock("@/app/actions/intelligence",()=>({logWaterProduction:vi.fn(),transitionWaterProduction:vi.fn(),getProductionHistory:vi.fn(),editWaterProduction:vi.fn(),reviewLegacyProduction:vi.fn(),upsertWaterSchemeSource:vi.fn(),archiveWaterSchemeSource:vi.fn()}))
import * as schema from "@/lib/db/schema"
import { productionService } from "@/lib/production/service"
import { loadProductionSummary } from "@/lib/production/reporting"
import { runIntelligenceEngine } from "@/lib/intelligence/engine"
import { getTrustedPerformanceDataset } from "@/lib/decision-support/performance-engine"
import { generateManagementReport } from "@/lib/decision-support/reports"
import { generateBoardPackPptx } from "@/lib/decision-support/board-pack"
import { getExcelReferencePerformanceDataset } from "@/lib/decision-support/excel-fixture"
import { evaluateNrwLoss } from "@/lib/intelligence/nrw"
import { validateWaterBalanceAndCapacity } from "@/lib/decision-support/data-validation"
import { ProductionPanel } from "@/components/production/production-panel"
import type { SessionUser } from "@/lib/session"

const prefix="outputs/phase-a-history-validation/"
const namespace=`history_proof_${randomUUID().replaceAll("-","")}`
const base=(name:string)=>readFileSync(`db/migrations/${name}`,"utf8")
const draft=readFileSync("outputs/phase-a-baseline-proposal/schema-draft.sql","utf8")
const captureDraft=readFileSync("outputs/phase-a-baseline-proposal/legacy-capture-draft.sql","utf8")
const hash=(data:unknown)=>createHash("sha256").update(typeof data==="string"?data:JSON.stringify(data)).digest("hex")
let pool:Pool
let db:ReturnType<typeof drizzle<typeof schema>>
const officer:SessionUser={id:"manager",name:"Synthetic officer",email:"manager@example.invalid",role:"admin",active:true,organizationId:"org",clusterId:null,branchId:null,schemeId:null,iamRoleId:null,roleLevel:100,permissions:["production.view","production.create","production.verify","production.sources.manage","intelligence.view","intelligence.investigate","intelligence.dismiss"].map(code=>({code,scope:"global"})),grants:[]}
const results:{name:string;equal:boolean;beforeSha256:string;afterSha256:string}[]=[]
const compare=(name:string,a:unknown,b:unknown)=>{expect(b).toEqual(a);results.push({name,equal:true,beforeSha256:hash(a),afterSha256:hash(b)})}

async function snapshot(){
 const summary=await loadProductionSummary(db,["spring-scheme","mixed-scheme"],"2024-07")
 const workspace=await productionService(db).workspace(officer,"spring-scheme","2024-07")
 const intelligence=await runIntelligenceEngine(officer,{periodId:"july-fixture"})
 const dataset=await getTrustedPerformanceDataset(officer,"july-fixture")
 const reports=Object.fromEntries((["monthly_management","production_capacity","nrw_loss","commercial_performance"] as const).map(t=>[t,generateManagementReport(t,dataset)]))
 const buffer=await generateBoardPackPptx(dataset)
 const zip=await JSZip.loadAsync(buffer)
 const boardParts=Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(k=>!zip.files[k].dir).sort().map(async k=>[k,await zip.file(k)!.async("string")])))
 const panel=renderToStaticMarkup(React.createElement(ProductionPanel,{data:workspace,reload:async()=>{},nextPage:async()=>{}}))
 const nrw={validation:validateWaterBalanceAndCapacity({waterProducedM3:100,waterBilledSoldM3:110,loggedDaysCount:31,daysInPeriod:31,practicalCapacityM3Period:200}),intelligence:evaluateNrwLoss({schemeId:"synthetic-negative",schemeName:"Synthetic negative",waterProducedM3:100,waterBilledSoldM3:110,dataCompletenessPercent:100})}
 return {summary,workspace,intelligence,dataset,reports,boardParts,panel,nrw,referenceFixture:getExcelReferencePerformanceDataset("august")}
}
type Snapshot=Awaited<ReturnType<typeof snapshot>>
let before:Snapshot,afterSchema:Snapshot,afterCapture:Snapshot,afterUnusedAssessment:Snapshot
let emptyBefore:Snapshot,emptyAfter:Snapshot
let originalBefore:unknown,originalAfter:unknown
let emptyCaptureCount:number
async function originalRows(){
 const out:Record<string,unknown>={}
 for(const table of ["water_scheme_source","water_production_log","scheme_target","billing_record","meter_reading","report_generation_history"]){out[table]=(await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) as rows from ${table} t`)).rows[0].rows}
 return out
}
beforeAll(async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-30T12:00:00Z"))
 // Fixed, explicit disposable cluster; never read DATABASE_URL or dotenv.
 pool=new Pool({host:"127.0.0.1",port:55473,user:"phase_a_test",database:"swuws_phase_a_production_test",max:1,options:`-c search_path=${namespace} -c statement_timeout=15000`,connectionTimeoutMillis:5000})
 await pool.query(`create schema ${namespace}`)
 db=drizzle(pool,{schema});runtime.database=db
 for(const n of ["0001_init.sql","0002_immutability.sql","0003_audit_log_immutability.sql","0005_customer_and_scheme_management.sql","0007_admin_plugin_columns.sql","0008_rbac_foundation.sql","0009_billing_module.sql","0012_receipt_billing_snapshots.sql","0013_collection_period_lifecycle.sql","0015_iam_module.sql","0025_meter_reading_module.sql","0061_swuws_intelligence.sql","0062_decision_support_actions_history.sql","0063_decision_support_scheme_mapping.sql","0069_production_integrity.sql","0070_production_permissions.sql","0071_production_review_independence.sql","0072_production_universal_self_approval_guard.sql"])await pool.query(base(n))
 await pool.query(`insert into organization(id,name,code) values('org','Synthetic org','O');insert into cluster(id,name,code,"organizationId") values('cluster','Synthetic cluster','C','org');insert into branch(id,name,code,"clusterId") values('branch','Synthetic branch','B','cluster');
 insert into water_scheme(id,name,code,"branchId") values('spring-scheme','Synthetic Ryakarimira example','R','branch'),('mixed-scheme','Synthetic Katuna example','K','branch');
 insert into "user"(id,name,email) values('manager','Synthetic officer','manager@example.invalid'),('operator','Synthetic operator','operator@example.invalid');
 insert into billing_period(id,month,year,"periodName","startDate","endDate",status) values('july-fixture',7,2024,'Synthetic July 2024','2024-08-01','2024-08-31','closed');`)
 emptyBefore=await snapshot()
 await pool.query('begin');await pool.query(draft);await pool.query("select set_config('swuws.capture_officer_id','manager',true)");await pool.query(captureDraft)
 emptyCaptureCount=(await pool.query('select count(*)::int n from source_capacity_assessment')).rows[0].n
 emptyAfter=await snapshot();await pool.query('rollback')
 await pool.query(`insert into water_scheme_source(id,"schemeId","sourceName","capacityMethod","containerVolumeLitres","averageFillTimeSeconds","installedPumpCapacityM3Hr","regimeHoursPerDay","currentCapacityM3Day","practicalCapacityM3Month","capacityConfirmedAt","capacityConfirmedById") values
 ('spring','spring-scheme','Synthetic Nyamabare','bucket_test',15,22.94,null,24,56.50,1694.86,'2024-07-01','manager'),
 ('pump','mixed-scheme','Synthetic Mayengo','measured_hourly',null,null,7.5,14,105,3150,'2024-07-01','manager'),
 ('gravity','mixed-scheme','Synthetic Nyakatare','bucket_test',15,19.11,null,24,67.82,2034.54,'2024-07-01','manager');
 insert into customer(id,name,"waterSchemeId") values('customer-r','Synthetic customer R','spring-scheme'),('customer-k','Synthetic customer K','mixed-scheme');
 insert into meter_reading(id,"customerId","billingPeriodId",consumption,"billedAmount","recordedById") values('reading-r','customer-r','july-fixture',746,1580028,'operator'),('reading-k','customer-k','july-fixture',2551,7627490,'operator');
 insert into billing_run(id,"schemeId","billingPeriodId","uploadedById") values('run-r','spring-scheme','july-fixture','manager'),('run-k','mixed-scheme','july-fixture','manager');
 insert into billing_record(id,"billingRunId","billingPeriodId","customerId","accountNumber","billAmount",arrears,"totalDue","dueDate") values('bill-r','run-r','july-fixture','customer-r','SYN-R',1580028,10000,900000,'2024-08-31'),('bill-k','run-k','july-fixture','customer-k','SYN-K',7627490,20000,4000000,'2024-08-31');
 insert into scheme_target(id,"schemeId","billingPeriodId","targetProductionM3") values('target-r','spring-scheme','july-fixture',1500);
 insert into water_production_log(id,"schemeId","logDate","waterProducedM3","recordedById") values('legacy','spring-scheme','2024-07-01',999,'operator');`)
 for(let d=1;d<=31;d++)for(const [source,scheme,volume]of [["spring","spring-scheme",d===31?"26.10":"26.13"],["pump","mixed-scheme","105"],["gravity","mixed-scheme",d===31?"56.20":"56.06"]])await pool.query(`insert into water_production_log(id,"schemeId","sourceId","productionDate","logDate","billingPeriodId","waterProducedM3","waterSuppliedM3","workflowVersion",status,"recordedById","verifiedById","verifiedAt","requestKey","requestFingerprint") values($1,$2,$3,$4,$4::date,'july-fixture',$5,null,1,'verified','operator','manager','2024-08-01',$6,$7)`,[`${source}-${d}`,scheme,source,`2024-07-${String(d).padStart(2,"0")}`,volume,randomUUID(),"a".repeat(64)])
 before=await snapshot();originalBefore=await originalRows()
 await pool.query('begin');await pool.query(draft);await pool.query('commit')
 afterSchema=await snapshot()
 await pool.query('begin');await pool.query('lock table water_scheme_source in share mode');await pool.query("select set_config('swuws.capture_officer_id','manager',true)");await pool.query(captureDraft);await pool.query('commit')
 afterCapture=await snapshot();originalAfter=await originalRows()
 await pool.query(`insert into source_capacity_assessment(id,"sourceId","schemeId","sourceVersion","assessmentKind",methodology,"methodologyVersion","assessedAt","effectiveFrom","responsibleOfficerId","capturedById","sourceWasActive",assumptions,provenance,"capacityM3Day") values('unused-new-assessment','spring','spring-scheme',1,'new_assessment','synthetic_explicit_yield','test',now(),(now() at time zone 'Africa/Kampala')::date,'manager','manager',true,'{}','{"synthetic":true,"purpose":"not selected for any historical period"}',500)`)
 afterUnusedAssessment=await snapshot()
},60000)
afterAll(async()=>{
 if(before&&afterSchema&&afterCapture&&afterUnusedAssessment)writeFileSync(prefix+'output-comparison-results.json',JSON.stringify({syntheticOnly:true,namespace,applicationImplementationChanged:false,normalization:'Clock fixed to 2026-10-30T12:00:00Z for volatile generation timestamps. Board Pack comparison covers every package part; ZIP container timestamps excluded.',emptyCaptureCount,checks:results,originalRowHashes:{before:hash(originalBefore),after:hash(originalAfter)},beforeKpis:before.dataset.kpis,afterKpis:afterCapture.dataset.kpis,beforeProduction:before.summary,afterProduction:afterCapture.summary,boardPackPartCount:Object.keys(before.boardParts).length,limitations:'Demonstrates existing code invariance when proposal tables are added/populated but not connected to application consumers. Does not prove future baseline-aware integration.'},null,2))
 await pool?.end();vi.useRealTimers()
})
describe('Phase A proposal: unchanged application outputs on synthetic PostgreSQL',()=>{
 it('preserves current empty-source empty-production state; snapshot proposal inserts zero rows',()=>{expect(emptyCaptureCount).toBe(0);compare('empty state',emptyBefore,emptyAfter)})
 it('does not change any existing rows during DDL or snapshot inserts',()=>compare('existing business-shaped fixture rows',originalBefore,originalAfter))
 for(const key of ['summary','workspace','intelligence','dataset','reports','boardParts','panel','nrw','referenceFixture'] as const)it(`preserves ${key} before/after schema, exact-copy capture and unused new assessment`,()=>{
  compare(key+' after schema',before[key],afterSchema[key]);compare(key+' after capture',before[key],afterCapture[key]);compare(key+' after unused assessment',before[key],afterUnusedAssessment[key])
 })
 it('compares populated verified totals from documented examples rather than only empty reports',()=>{
  expect(before.dataset.kpis.waterProducedM3).toBe(5803);expect(before.dataset.kpis.waterSoldM3).toBe(3297)
  expect(before.summary.find(s=>s.schemeId==='spring-scheme')?.totalWaterProducedM3).toBe('810.00')
  expect(before.summary.find(s=>s.schemeId==='mixed-scheme')?.totalWaterProducedM3).toBe('4993.00')
  expect(before.summary.every(s=>s.loggedDaysCount===31)).toBe(true)
  expect(Object.keys(before.boardParts).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(14)
 })
 it('refuses workbook-to-assessment FK assignment when the database has no registered source',async()=>{
  await expect(pool.query(`insert into source_capacity_assessment(id,"sourceId","schemeId","sourceVersion","assessmentKind",methodology,"methodologyVersion","capturedById","sourceWasActive",assumptions,provenance,"originalSourceRow") values('unregistered-workbook','missing-source','spring-scheme',1,'legacy_snapshot','unknown','as-written','manager',true,'{}','{"synthetic":true}','{}')`)).rejects.toThrow(/foreign key/)
 })
})
