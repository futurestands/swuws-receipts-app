import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
// No application pool/credentials are used, even accidentally through a service default.
const runtime=vi.hoisted(()=>({database:undefined as unknown,currentUser:undefined as unknown}))
vi.mock("@/lib/db", () => ({ get db() { return runtime.database } }))
vi.mock("@/lib/session",()=>({requireUser:async()=>runtime.currentUser}))
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}))
import * as schema from "@/lib/db/schema"
import { productionService } from "./service"
import { loadProductionSummary } from "./reporting"
import { productionTestDatabaseUrl } from "./test-database"
import type { SessionUser } from "@/lib/session"
import { getTrustedPerformanceDataset } from "@/lib/decision-support/performance-engine"
import { runIntelligenceEngine } from "@/lib/intelligence/engine"
import { updateFindingStatus } from "@/app/actions/intelligence"
import { generateManagementReport } from "@/lib/decision-support/reports"

const migration = (name: string) => readFileSync(`db/migrations/${name}`, "utf8")
const namespace = `production_it_${randomUUID().replaceAll("-", "")}`
let pool: Pool
let adminPool: Pool
let database: ReturnType<typeof drizzle<typeof schema>>
let service: ReturnType<typeof productionService>
const actor = (id: string, codes: string[], scope = "scheme", org = "org-a", schemeId: string | null = "scheme-a"): SessionUser => ({ id, name: id, email: `${id}@example.invalid`, role: "agent", active: true, organizationId: org, clusterId: null, branchId: null, schemeId, iamRoleId: null, roleLevel: 1, permissions: codes.map(code => ({ code, scope })), grants: [] })
const operator = actor("operator", ["production.view", "production.create"])
const verifier = actor("verifier", ["production.view", "production.verify"])
const manager = actor("manager", ["production.view", "production.sources.manage"])
const all = actor("operator", ["production.view", "production.create", "production.verify"])
let sourceId: string
let serial = 0
function entry(extra: Record<string, unknown> = {}) {
  return { schemeId:"scheme-a",sourceId,productionDate:extra.productionDate ?? `2024-02-${String(++serial).padStart(2,"0")}`,waterProducedM3:"12.30",waterSuppliedM3:"0",operatingHours:"0",notes:"",requestKey:randomUUID(),...extra }
}
async function summary() { return (await loadProductionSummary(database,["scheme-a"],"2024-02"))[0] }

beforeAll(async () => {
  const url = productionTestDatabaseUrl()
  adminPool = new Pool({ connectionString:url, max:1 })
  await adminPool.query(`create schema ${namespace}`)
  pool = new Pool({ connectionString:url, max:6, options:`-c search_path=${namespace} -c statement_timeout=10000` })
  database = drizzle(pool, { schema })
  runtime.database=database
  // Historical files are applied ONLY to this empty disposable namespace, never via .env/migrate.js.
  for (const name of ["0001_init.sql","0002_immutability.sql","0003_audit_log_immutability.sql","0005_customer_and_scheme_management.sql","0008_rbac_foundation.sql","0009_billing_module.sql","0013_collection_period_lifecycle.sql","0015_iam_module.sql","0025_meter_reading_module.sql","0061_swuws_intelligence.sql","0064_ebs_gateway_config.sql","0065_pegasus_event_and_rotation.sql","0066_pegasus_event_delete_guard.sql"]) await pool.query(migration(name))
  await pool.query(`insert into organization(id,name,code) values ('org-a','Test organisation A','A'),('org-b','Test organisation B','B');
    insert into cluster(id,name,code,"organizationId") values ('cluster-a','Test cluster A','A','org-a'),('cluster-b','Test cluster B','B','org-b');
    insert into branch(id,name,code,"clusterId") values ('branch-a','Test branch A','A','cluster-a'),('branch-b','Test branch B','B','cluster-b');
    insert into water_scheme(id,name,code,"branchId") values ('scheme-a','Test scheme A','A','branch-a'),('scheme-b','Test scheme B','B','branch-b');
    insert into "user"(id,name,email) values ('operator','Test operator','operator@example.invalid'),('verifier','Test verifier','verifier@example.invalid'),('manager','Test manager','manager@example.invalid');
    insert into "user"(id,name,email,"organizationId","schemeId") values ('assignee-a','Test assignee A','assignee-a@example.invalid','org-a','scheme-a'),('assignee-b','Test assignee B','assignee-b@example.invalid','org-b','scheme-b');
    insert into billing_period(id,month,year,"periodName","startDate","endDate",status) values ('feb',2,2024,'February 2024','2024-03-01','2024-03-31','closed');
    insert into water_production_log(id,"schemeId","logDate","waterProducedM3","waterSuppliedM3","recordedById") values ('legacy','scheme-a','2024-02-01',42,0,'operator');`)
  // Verify invalid legacy data fails migration instead of being silently repaired.
  await pool.query(`insert into water_scheme_source(id,"schemeId","sourceName","installedPumpCapacityM3Hr") values ('invalid-preflight','scheme-a','Bad legacy configuration',-1)`)
  const client=await pool.connect()
  try { await client.query("begin"); await expect(client.query(migration("0069_production_integrity.sql"))).rejects.toThrow(); await client.query("rollback") } finally { client.release() }
  await pool.query(`delete from water_scheme_source where id='invalid-preflight'`)
  for(const name of ["0069_production_integrity.sql","0070_production_permissions.sql"]){const c=await pool.connect();try{await c.query("begin");await c.query(migration(name));await c.query("commit")}catch(e){await c.query("rollback");throw e}finally{c.release()}}
  await pool.query(migration("0071_production_review_independence.sql"))
  await pool.query(migration("0072_production_universal_self_approval_guard.sql"))
  service=productionService(database)
  const source=await service.saveSource(manager,{schemeId:"scheme-a",sourceName:"Test spring",technology:"gravity",capacityMethod:"bucket_test",containerVolumeLitres:"20",averageFillTimeSeconds:"10",regimeHoursPerDay:"0"})
  sourceId=source.id
},60000)

afterAll(async()=>{
  await pool?.end()
  if(adminPool){await adminPool.query(`drop schema if exists ${namespace} cascade`);await adminPool.end()}
})

describe("production integrity on disposable PostgreSQL",()=>{
  it("requires explicit scoped production grants for admin operations",async()=>{
    const admin={...operator,role:"admin",permissions:[],grants:[]}
    const workspace=await service.workspace(admin,"scheme-a","2024-02")
    expect(workspace.capabilities).toEqual({create:false,verify:false,sources:false})
    await expect(service.create(admin,entry({productionDate:"2024-06-01"}))).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.saveSource(admin,{schemeId:"scheme-a",sourceName:"Unauthorised",technology:"gravity",capacityMethod:"unknown"})).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.archiveSource(admin,{id:sourceId,expectedVersion:1})).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.reviewLegacy(admin,{...entry({productionDate:"2024-06-07"}),id:"legacy",expectedVersion:1,reason:"Synthetic permission check"})).rejects.toMatchObject({code:"FORBIDDEN"})
    const row=await service.create({...operator,role:"admin"},entry({productionDate:"2024-06-01"}))
    await expect(service.transition({...verifier,role:"admin",permissions:[]},{id:row.id,expectedVersion:1,operation:"verify"})).rejects.toMatchObject({code:"FORBIDDEN"})
    const {requestKey:_key,...data}=entry({productionDate:"2024-06-01"});void _key
    await expect(service.edit(admin,{...data,id:row.id,expectedVersion:1})).rejects.toMatchObject({code:"FORBIDDEN"})
    expect((await service.transition({...verifier,role:"admin"},{id:row.id,expectedVersion:1,operation:"verify"})).status).toBe("verified")
  })
  it("blocks legacy reviewer self-approval in service, UI DTO and PostgreSQL",async()=>{
    await pool.query(`insert into water_production_log(id,"schemeId","logDate","waterProducedM3","recordedById") values ('legacy-independence','scheme-a','2024-06-02',1,'operator')`)
    const row=await service.reviewLegacy(verifier,{...entry({productionDate:"2024-06-02",waterProducedM3:"999"}),id:"legacy-independence",expectedVersion:1,reason:"Synthetic legacy measurement review"})
    await expect(service.transition(verifier,{id:row.id,expectedVersion:2,operation:"verify"})).rejects.toMatchObject({code:"FORBIDDEN"})
    const workspace=await service.workspace(verifier,"scheme-a","2024-06")
    expect(workspace.records.find(r=>r.id===row.id)?.legacyReviewerIds).toContain("verifier")
    await expect(pool.query(`update water_production_log set status='verified',"verifiedById"='verifier',"verifiedAt"=now(),version=version+1 where id=$1`,[row.id])).rejects.toThrow("independent verifier")
    expect((await service.transition({...verifier,id:"manager"},{id:row.id,expectedVersion:2,operation:"verify"})).status).toBe("verified")
    await pool.query(migration("0071_production_review_independence.sql"))
  })
  it("returns history actor identity for review actions",async()=>{
    const row=await service.create(operator,entry({productionDate:"2024-06-03"}))
    await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"flag",reason:"Synthetic review reason"})
    expect((await service.history(verifier,row.id)).find(h=>h.action==="production.log.flag")).toMatchObject({userId:"verifier",userName:"verifier"})
  })
  it("marks absent periods incomplete rather than validated zero loss",async()=>{
    const dataset=await getTrustedPerformanceDataset({...verifier,role:"head_commercial"},"missing-period","scheme-a")
    expect(dataset.production?.available).toBe(false)
    expect(dataset.kpis.lossValidationStatus).toBe("INCOMPLETE_DATA")
    expect(dataset.kpis.displayLossIndicator).toBe("Unavailable")
  })
  it("refuses migration when historic legacy review was approved by its reviewer, without altering data",async()=>{
    const client=await pool.connect()
    try {
      await client.query("begin")
      await client.query(`insert into water_production_log(id,"schemeId","sourceId","logDate","productionDate","workflowVersion",version,"requestKey","requestFingerprint","recordedById",status,"verifiedById","verifiedAt") values ('unsafe-approval','scheme-a',$1,'2024-06-06','2024-06-06',1,1,$2,$3,'operator','verified','verifier',now())`,[sourceId,randomUUID(),"a".repeat(64)])
      await client.query(`insert into audit_log(id,"userId",action,"entityType","entityId") values ('unsafe-review','verifier','production.log.legacy_review','water_production_log','unsafe-approval')`)
      await expect(client.query(migration("0071_production_review_independence.sql"))).rejects.toThrow("authorised reconciliation")
    } finally { await client.query("rollback");client.release() }
    expect((await pool.query(`select id from water_production_log where id='unsafe-approval'`)).rows).toHaveLength(0)
  })
  it("scopes finding updates, validates transition grants and persists real dynamic evidence",async()=>{
    await pool.query(`insert into intelligence_finding(id,"schemeId",category,severity,title,description,evidence,status) values ('foreign-finding','scheme-b','production','high','Synthetic','Synthetic','{}','OPEN'),('local-finding','scheme-a','production','high','Synthetic','Synthetic','{}','OPEN')`)
    runtime.currentUser={...verifier,permissions:[{code:"intelligence.view",scope:"scheme"},{code:"intelligence.investigate",scope:"scheme"}]}
    await expect(updateFindingStatus({findingId:"foreign-finding",status:"UNDER_INVESTIGATION"})).rejects.toThrow()
    runtime.currentUser={...verifier,schemeId:null,permissions:[{code:"intelligence.view",scope:"global"},{code:"intelligence.investigate",scope:"global"}]}
    await expect(updateFindingStatus({findingId:"foreign-finding",status:"UNDER_INVESTIGATION"})).rejects.toThrow()
    runtime.currentUser={...verifier,permissions:[{code:"intelligence.view",scope:"scheme"},{code:"intelligence.investigate",scope:"scheme"}]}
    await expect(updateFindingStatus({findingId:"local-finding",status:"DISMISSED"})).rejects.toThrow()
    await expect(updateFindingStatus({findingId:"invented-finding",status:"UNDER_INVESTIGATION"})).rejects.toThrow()
    await expect(updateFindingStatus({findingId:"local-finding",status:"INVALID" as "OPEN"})).rejects.toThrow()
    await expect(updateFindingStatus({findingId:"local-finding",status:"UNDER_INVESTIGATION",assignedToUserId:"manager"})).rejects.toThrow()
    await expect(updateFindingStatus({findingId:"local-finding",status:"UNDER_INVESTIGATION",assignedToUserId:"assignee-b"})).rejects.toThrow()
    await updateFindingStatus({findingId:"local-finding",status:"UNDER_INVESTIGATION",assignedToUserId:"assignee-a"})
    expect((await pool.query(`select status from intelligence_finding where id='local-finding'`)).rows[0].status).toBe("UNDER_INVESTIGATION")
    runtime.currentUser={...verifier,permissions:[{code:"intelligence.view",scope:"scheme"},{code:"intelligence.dismiss",scope:"scheme"}]}
    await updateFindingStatus({findingId:"local-finding",status:"DISMISSED"})
    expect((await pool.query(`select status from intelligence_finding where id='foreign-finding'`)).rows[0].status).toBe("OPEN")
    runtime.currentUser={...verifier,role:"admin",permissions:[]}
    await expect(updateFindingStatus({findingId:"local-finding",status:"OPEN"})).rejects.toThrow()
    runtime.currentUser={...verifier,permissions:[{code:"intelligence.view",scope:"scheme"},{code:"intelligence.investigate",scope:"scheme"}]}
    const generated=(await runIntelligenceEngine(runtime.currentUser as SessionUser)).findings[0]
    expect(generated).toBeTruthy()
    await updateFindingStatus({findingId:generated.id,status:"UNDER_INVESTIGATION",resolutionNotes:"Investigate real generated evidence"})
    expect((await pool.query(`select "schemeId",category,title from intelligence_finding where id=$1`,[generated.id])).rows[0]).toMatchObject({schemeId:"scheme-a",category:generated.category,title:generated.title})
    expect((await runIntelligenceEngine(runtime.currentUser as SessionUser)).findings.find(f=>f.id===generated.id)?.status).toBe("UNDER_INVESTIGATION")
  })
  it("rolls back finding status changes when their audit insert fails",async()=>{
    await pool.query(`insert into intelligence_finding(id,"schemeId",category,severity,title,description,evidence,status) values ('audit-failure-finding','scheme-a','production','high','Synthetic','Synthetic','{}','OPEN');
      create function reject_test_finding_audit() returns trigger language plpgsql as $$ begin if NEW."entityId"='audit-failure-finding' then raise exception 'Synthetic finding audit failure'; end if; return NEW; end $$;
      create trigger reject_test_finding_audit before insert on audit_log for each row execute function reject_test_finding_audit();`)
    try {
      runtime.currentUser={...verifier,permissions:[{code:"intelligence.view",scope:"scheme"},{code:"intelligence.investigate",scope:"scheme"}]}
      await expect(updateFindingStatus({findingId:"audit-failure-finding",status:"UNDER_INVESTIGATION"})).rejects.toThrow()
      expect((await pool.query(`select status from intelligence_finding where id='audit-failure-finding'`)).rows[0].status).toBe("OPEN")
    } finally { await pool.query(`drop trigger reject_test_finding_audit on audit_log; drop function reject_test_finding_audit();`) }
  })
  it("preserves legacy measurements and installs definitions without broad grants",async()=>{
    const r=await pool.query(`select "waterProducedM3","waterSuppliedM3","workflowVersion" from water_production_log where id='legacy'`)
    expect(r.rows[0]).toEqual({waterProducedM3:"42.00",waterSuppliedM3:"0.00",workflowVersion:0})
    expect((await summary()).available).toBe(false)
    expect((await pool.query(`select count(*)::int n from iam_permission where module='Production'`)).rows[0].n).toBe(4)
    expect((await pool.query(`select count(*)::int n from iam_role_permission rp join iam_permission p on p.id=rp.permission_id where p.module='Production'`)).rows[0].n).toBe(0)
  })
  it("keeps zero supplied/hours and links billed month rather than collection dates",async()=>{
    const row=await service.create(operator,entry())
    expect(row).toMatchObject({waterProducedM3:"12.30",waterSuppliedM3:"0.00",operatingHours:"0.00",billingPeriodId:"feb",status:"entered"})
    expect((await summary()).logsCount).toBe(0)
    const verified=await service.transition(verifier,{id:row.id,expectedVersion:row.version,operation:"verify"})
    expect(verified.status).toBe("verified")
    expect(await summary()).toMatchObject({totalWaterProducedM3:"12.30",totalWaterSuppliedM3:"0.00",logsCount:1,loggedDaysCount:1,available:true,suppliedComplete:true,currentCapacityM3Month:0})
  })
  it("allows date-authoritative recording without a billing period",async()=>{
    const row=await service.create(operator,entry({productionDate:"2024-01-31"}))
    expect(row.billingPeriodId).toBeNull()
    await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})
    expect((await loadProductionSummary(database,["scheme-a"],"2024-01"))[0].logsCount).toBe(1)
  })
  it("rejects mismatched or ambiguous reporting periods without writing",async()=>{
    await expect(service.create(operator,entry({billingPeriodId:"wrong"}))).rejects.toMatchObject({code:"VALIDATION"})
    await pool.query(`insert into billing_period(id,month,year,"periodName","startDate","endDate") values ('duplicate-feb',2,2024,'Duplicate','2024-04-01','2024-04-30')`)
    await expect(service.create(operator,entry())).rejects.toMatchObject({code:"CONFIGURATION"})
    await pool.query(`delete from billing_period where id='duplicate-feb'`)
  })
  it("serialises same-key concurrent retries and rejects changed payloads",async()=>{
    const data=entry();const rows=await Promise.all([service.create(operator,data),service.create(operator,data)])
    expect(rows[0].id).toBe(rows[1].id)
    expect((await pool.query(`select count(*)::int n from audit_log where "entityId"=$1`,[rows[0].id])).rows[0].n).toBe(1)
    await expect(service.create(operator,{...data,waterProducedM3:"99"})).rejects.toMatchObject({code:"CONFLICT"})
  })
  it("enforces source/day uniqueness even across independent concurrent request keys",async()=>{
    const data=entry();const results=await Promise.allSettled([service.create(operator,data),service.create(operator,{...data,requestKey:randomUUID()})])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  })
  it("rolls back measurements when atomic audit logging fails",async()=>{
    const failing=productionService(database,async()=>{throw new Error("Synthetic audit failure")})
    const data=entry()
    await expect(failing.create(operator,data)).rejects.toThrow("Synthetic audit failure")
    expect((await pool.query(`select count(*)::int n from water_production_log where "requestKey"=$1`,[data.requestKey])).rows[0].n).toBe(0)
  })
  it("requires independent verification and revocation before correction",async()=>{
    const data=entry();let row=await service.create(operator,data)
    await expect(service.transition(all,{id:row.id,expectedVersion:1,operation:"verify"})).rejects.toMatchObject({code:"FORBIDDEN"})
    row=await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})
    const {requestKey: _initialKey,...initialMeasurement}=data;void _initialKey
    await expect(service.edit(operator,{...initialMeasurement,id:row.id,expectedVersion:2})).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(pool.query(`update water_production_log set "waterSuppliedM3"=1,version=version+1 where id=$1`,[row.id])).rejects.toThrow("transition")
    row=await service.transition(verifier,{id:row.id,expectedVersion:2,operation:"revoke",reason:"Correct a measured volume"})
    const {requestKey: _key,...measurement}=data;void _key
    row=await service.edit(operator,{...measurement,id:row.id,expectedVersion:3,waterProducedM3:"13"})
    expect(row).toMatchObject({status:"entered",version:4,verifiedById:null})
    row=await service.transition(verifier,{id:row.id,expectedVersion:4,operation:"verify"})
    expect(row).toMatchObject({status:"verified",version:5})
    expect((await service.history(verifier,row.id)).map(h=>h.action)).toContain("production.log.revoke")
  })
  it("rejects stale concurrent edits and duplicate verification",async()=>{
    const {requestKey: _key,...data}=entry();void _key
    const row=await service.create(operator,{...data,requestKey:randomUUID()})
    const changes={...data,id:row.id,expectedVersion:1}
    const results=await Promise.allSettled([service.edit(operator,{...changes,waterProducedM3:"1"}),service.edit(operator,{...changes,waterProducedM3:"2"})])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    await service.transition(verifier,{id:row.id,expectedVersion:2,operation:"verify"})
    await expect(service.transition(verifier,{id:row.id,expectedVersion:2,operation:"verify"})).rejects.toMatchObject({code:"CONFLICT"})
  })
  it("does not leak or mutate foreign organisations, sources, history or retry results",async()=>{
    const data=entry();const row=await service.create(operator,data)
    const foreign=actor("operator",["production.view","production.create","production.verify"],"global","org-b",null)
    await expect(service.workspace(foreign,"scheme-a")).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.history(foreign,row.id)).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.create(foreign,data)).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(service.create(operator,entry({sourceId:"foreign-source"}))).rejects.toMatchObject({code:"FORBIDDEN"})
    const reader=actor("operator",["production.view"])
    await expect(service.create(reader,entry())).rejects.toMatchObject({code:"FORBIDDEN"})
    const intelligenceOnly={...reader,role:"head_commercial",roleLevel:100,permissions:[{code:"intelligence.view",scope:"global"}]}
    await expect(service.create(intelligenceOnly,entry())).rejects.toMatchObject({code:"FORBIDDEN"})
  })
  it("scopes own-only reads and prevents own-only verification",async()=>{
    const own=actor("verifier",["production.view","production.verify"],"own")
    const workspace=await service.workspace(own,"scheme-a","2024-02")
    expect(workspace.records).toHaveLength(0);expect(workspace.capabilities.verify).toBe(false)
  })
  it("validates supplied-over-produced before verification and distinguishes null supplied",async()=>{
    const row=await service.create(operator,entry({waterProducedM3:"0",waterSuppliedM3:"1"}))
    await expect(service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})).rejects.toMatchObject({code:"VALIDATION"})
    const row2=await service.create(operator,entry({waterSuppliedM3:""}))
    await service.transition(verifier,{id:row2.id,expectedVersion:1,operation:"verify"})
    expect((await summary()).suppliedComplete).toBe(false)
  })
  it("voids without deletion, releases daily slot and prevents parent deletion",async()=>{
    const data=entry();let row=await service.create(operator,data)
    await expect(pool.query(`delete from water_production_log where id=$1`,[row.id])).rejects.toThrow("cannot be deleted")
    await expect(pool.query(`delete from water_scheme_source where id=$1`,[sourceId])).rejects.toThrow()
    await expect(pool.query(`delete from water_scheme where id='scheme-a'`)).rejects.toThrow()
    row=await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"void",reason:"Recorded against incorrect day"})
    expect(row.status).toBe("void")
    expect((await service.create(operator,{...data,requestKey:randomUUID()})).id).not.toBe(row.id)
    await expect(service.transition(verifier,{id:row.id,expectedVersion:2,operation:"verify"})).rejects.toMatchObject({code:"CONFLICT"})
  })
  it("rejects negative/non-finite values and cross-scheme relationships in PostgreSQL",async()=>{
    await expect(pool.query(`insert into water_production_log(id,"schemeId","logDate","waterProducedM3") values ('negative','scheme-a',now(),-1)`)).rejects.toThrow()
    await expect(pool.query(`insert into water_production_log(id,"schemeId","logDate","waterProducedM3") values ('nan','scheme-a',now(),'NaN')`)).rejects.toThrow()
    await expect(pool.query(`insert into water_production_log(id,"schemeId","sourceId","logDate") values ('foreign','scheme-b',$1,now())`,[sourceId])).rejects.toThrow()
    await expect(pool.query(`update water_scheme_source set "currentCapacityM3Day"='NaN',version=version+1 where id=$1`,[sourceId])).rejects.toThrow()
    await expect(pool.query(`update water_scheme_source set "containerVolumeLitres"=null,version=version+1 where id=$1`,[sourceId])).rejects.toThrow()
    await expect(pool.query(`update water_production_log set id='tampered-identity',version=version+1 where id=(select id from water_production_log where "workflowVersion"=1 limit 1)`)).rejects.toThrow("identity is immutable")
  })
  it("explicitly reviews legacy data without silently verifying it",async()=>{
    const data=entry({productionDate:"2024-01-30"});const row=await service.reviewLegacy(verifier,{...data,id:"legacy",expectedVersion:1,reason:"Confirm historical source and date"})
    expect(row).toMatchObject({workflowVersion:1,status:"entered",recordedById:"operator",productionDate:"2024-01-30"})
    expect((await loadProductionSummary(database,["scheme-a"],"2024-01"))[0].logsCount).toBe(1)
  })
  it("enforces universal database-level self-approval prevention on new and direct updates",async()=>{
    const row=await service.create(operator,entry({productionDate:"2024-06-20"}))
    await expect(service.transition(operator,{id:row.id,expectedVersion:1,operation:"verify"})).rejects.toMatchObject({code:"FORBIDDEN"})
    await expect(pool.query(`update water_production_log set status='verified',"verifiedById"='operator',"verifiedAt"=now() where id=$1`,[row.id])).rejects.toThrow("Self-approval is forbidden")
    await expect(pool.query(`update water_production_log set status='verified',"verifiedById"=null where id=$1`,[row.id])).rejects.toThrow("explicit verifiedById")
    const verified=await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})
    expect(verified.status).toBe("verified")
  })
  it("counts distinct verified dates across sources, not rows",async()=>{
    const source=await service.saveSource(manager,{schemeId:"scheme-a",sourceName:"Second spring",technology:"gravity",capacityMethod:"unknown"})
    const data=entry();const a=await service.create(operator,data);const b=await service.create(operator,{...data,sourceId:source.id,requestKey:randomUUID()})
    const previous=await summary()
    await service.transition(verifier,{id:a.id,expectedVersion:1,operation:"verify"});await service.transition(verifier,{id:b.id,expectedVersion:1,operation:"verify"})
    const current=await summary();expect(current.logsCount).toBe(previous.logsCount+2);expect(current.loggedDaysCount).toBe(previous.loggedDaysCount+1);expect(current.currentCapacityM3Month).toBeNull()
    const workspace=await service.workspace(operator,"scheme-a","2024-02")
    expect(workspace).not.toHaveProperty("kpis");expect(workspace).not.toHaveProperty("findings")
  })
  it("versions source changes, prevents reparenting and rejects new logs for archived sources",async()=>{
    const source=await service.saveSource(manager,{schemeId:"scheme-a",sourceName:"Archive spring",technology:"gravity",capacityMethod:"unknown"})
    await expect(service.saveSource(manager,{id:source.id,expectedVersion:1,schemeId:"scheme-b",sourceName:"Moved",technology:"gravity",capacityMethod:"unknown"})).rejects.toMatchObject({code:"FORBIDDEN"})
    await service.archiveSource(manager,{id:source.id,expectedVersion:1})
    await expect(service.archiveSource(manager,{id:source.id,expectedVersion:1})).rejects.toMatchObject({code:"CONFLICT"})
    await expect(service.create(operator,entry({sourceId:source.id,productionDate:"2024-01-29"}))).rejects.toMatchObject({code:"FORBIDDEN"})
  })
  it("uses the same verified date-based observations in both existing reporting engines",async()=>{
    const analyst={...verifier,role:"head_commercial",permissions:[{code:"intelligence.view",scope:"global"}]}
    const expected=await summary()
    const dataset=await getTrustedPerformanceDataset(analyst,"feb","scheme-a")
    expect(dataset.kpis.waterProducedM3).toBe(Number(expected.totalWaterProducedM3))
    expect(dataset.production).toMatchObject({available:true,provisionalProducedM3:Number(expected.provisionalProducedM3)})
    for(const type of ["monthly_management","production_capacity","nrw_loss","commercial_performance"] as const){
      const report=generateManagementReport(type,dataset)
      expect(report.sections.length).toBeGreaterThan(0)
      expect(JSON.stringify(report)).not.toContain("Unavailable%")
    }
    expect(dataset.schemesMatrix[0].capacityAvailable).toBe(false)
    expect(generateManagementReport("monthly_management",dataset).sections[1].metricsTable!.rows[0][2]).toBe("Unavailable")
    const intelligence=await runIntelligenceEngine(analyst,{periodId:"feb",schemeId:"scheme-a"})
    // The prior month's coverage is insufficient; no manufactured trend is allowed.
    expect(intelligence.periodChanges).toHaveLength(0)
    expect(intelligence.findings.some(f=>f.category==='production')).toBe(false)
    const foreign={...analyst,organizationId:"org-b",schemeId:null}
    expect((await getTrustedPerformanceDataset(foreign,"feb","scheme-a")).schemesMatrix).toHaveLength(0)
  })
  it("distinguishes an independently verified zero from missing observations",async()=>{
    const row=await service.create(operator,entry({productionDate:"2024-04-30",waterProducedM3:"0",waterSuppliedM3:"0"}))
    expect((await loadProductionSummary(database,["scheme-a"],"2024-04"))[0].available).toBe(false)
    await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})
    expect((await loadProductionSummary(database,["scheme-a"],"2024-04"))[0]).toMatchObject({available:true,totalWaterProducedM3:"0.00",totalWaterSuppliedM3:"0.00",logsCount:1})
  })
  it("keeps an unchanged retry stable when a billing month becomes available later",async()=>{
    const data=entry({productionDate:"2024-03-31"});const row=await service.create(operator,data)
    expect(row.billingPeriodId).toBeNull()
    await pool.query(`insert into billing_period(id,month,year,"periodName","startDate","endDate") values ('mar',3,2024,'March 2024','2024-04-01','2024-04-30')`)
    expect((await service.create(operator,data)).id).toBe(row.id)
    await service.transition(verifier,{id:row.id,expectedVersion:1,operation:"verify"})
    expect((await loadProductionSummary(database,["scheme-a"],"2024-03"))[0].logsCount).toBe(1)
  })
  it("reruns new migrations without changing rows or dropping existing protection triggers",async()=>{
    const before=await pool.query(`select count(*)::int n from water_production_log`)
    await pool.query(migration("0069_production_integrity.sql"));await pool.query(migration("0070_production_permissions.sql"))
    await pool.query(migration("0071_production_review_independence.sql"))
    expect((await pool.query(`select count(*)::int n from water_production_log`)).rows).toEqual(before.rows)
    const triggers=(await pool.query(`select trigger_name from information_schema.triggers where trigger_schema=$1`,[namespace])).rows.map(r=>r.trigger_name)
    for(const name of ["receipt_no_update","receipt_no_delete","receipt_attachment_no_update","audit_log_no_update","pegasus_event_security_guard_trg","production_log_guard"])expect(triggers).toContain(name)
    await expect(database.execute(sql`update audit_log set action = 'tamper' where id = (select id from audit_log limit 1)`)).rejects.toThrow()
    await pool.query(`insert into receipt(id,"paymentReference","customerName",amount,"paymentDate","agentId","agentName","agentEmail","orgNameSnapshot","disclaimerSnapshot","footerSnapshot") values ('protected-receipt','synthetic','Synthetic customer',1,now(),'operator','Synthetic operator','operator@example.invalid','Test','Test','Test');
      insert into receipt_attachment(id,"receiptId",url,"fileName","fileSize","uploadedById","uploadedByName") values ('protected-attachment','protected-receipt','https://example.invalid/test','test',1,'operator','Synthetic operator');
      insert into pegasus_event(id,"providerEventId","signatureVerified","rawPayload") values ('protected-event','synthetic-event',true,'{}');`)
    await expect(pool.query(`update receipt set amount=2 where id='protected-receipt'`)).rejects.toThrow()
    await expect(pool.query(`delete from receipt where id='protected-receipt'`)).rejects.toThrow()
    await expect(pool.query(`delete from receipt_attachment where id='protected-attachment'`)).rejects.toThrow()
    await expect(pool.query(`update pegasus_event set "rawPayload"='{"tampered":true}' where id='protected-event'`)).rejects.toThrow()
    await expect(pool.query(`delete from pegasus_event where id='protected-event'`)).rejects.toThrow()
  })
})
