// Isolated migration proposal proof. No dotenv, application imports or configurable host.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../..');
const database = 'swuws_phase_a_production_test';
const target = { host: '127.0.0.1', port: 55473, user: 'phase_a_test', database, connectionTimeoutMillis: 5000 };
assert.match(database, /_production_test$/);
const namespace = `phase_a_${crypto.randomUUID().replaceAll('-', '')}`;
const checks = [];
const sqlFile = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const migration = name => fs.readFileSync(path.join(root, 'db/migrations', name), 'utf8');
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report = { target: { host: target.host, port: target.port, database }, namespace, checks, syntheticOnly: true };
let client;

async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function transaction(fn) {
  await client.query('begin');
  try { const result = await fn(); await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; }
}
async function rejects(sql, pattern, parameters) {
  await assert.rejects(transaction(() => client.query(sql, parameters)), pattern);
}
async function originalRows() {
  const tables = ['water_scheme_source','water_production_log','scheme_target','report_generation_history','water_scheme','user'];
  const rows = {};
  for (const table of tables) rows[table] = (await client.query(`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) as rows from "${table}" t`)).rows[0].rows;
  return rows;
}
async function capture(actor = 'manager') {
  await transaction(async () => {
    await client.query('lock table water_scheme_source in share mode');
    await client.query("select set_config('swuws.capture_officer_id',$1,true)", [actor]);
    await client.query(sqlFile('legacy-capture-draft.sql'));
  });
}
async function baseline(id, overrides = {}) {
  const o = { capacity: '4844.86', count: 2, completeness: 'complete', revision: 1, supersedes: null, ...overrides };
  await client.query(`insert into scheme_capacity_baseline(id,"schemeId","periodMonth",revision,"supersedesId",basis,"dayCount","capacityM3",completeness,"expectedSourceCount","selectedById",reason,assumptions,provenance)
    values($1,'scheme-a','2024-07-01',$2,$3,'preserved_report',null,$4,$5,$6,'manager','Synthetic archived report fixture, explicitly associated; never inferred from source dates','{}','{"fixture":"synthetic reviewed historical report"}')`, [id,o.revision,o.supersedes,o.capacity,o.completeness,o.count]);
}
async function member(baselineId, source, assessmentId, amount) {
  await client.query(`insert into scheme_capacity_baseline_source("baselineId","schemeId","sourceId","assessmentId","contributionM3",provenance)
    values($1,'scheme-a',$2,$3,$4,'{"fixture":"explicit preserved contribution"}')`,[baselineId,source,assessmentId,amount]);
}

(async () => {
  const admin = new Client({ ...target, database: 'postgres' });
  await admin.connect();
  try { await admin.query(`create database ${database}`); }
  catch (error) { if (error.code !== '42P04') throw error; }
  finally { await admin.end(); }
  client = new Client(target);
  await client.connect();
  await client.query(`create schema ${namespace}`);
  await client.query(`set search_path to ${namespace}`);
  await client.query("set statement_timeout='15s'");
  report.postgresqlVersion = (await client.query('show server_version')).rows[0].server_version;
  for (const name of ['0001_init.sql','0002_immutability.sql','0003_audit_log_immutability.sql','0005_customer_and_scheme_management.sql','0008_rbac_foundation.sql','0009_billing_module.sql','0013_collection_period_lifecycle.sql','0015_iam_module.sql','0025_meter_reading_module.sql','0061_swuws_intelligence.sql','0062_decision_support_actions_history.sql','0069_production_integrity.sql','0070_production_permissions.sql','0071_production_review_independence.sql','0072_production_universal_self_approval_guard.sql']) await client.query(migration(name));
  await client.query(`insert into organization(id,name,code) values('org','Synthetic','O');
    insert into cluster(id,name,code,"organizationId") values('cluster','Synthetic','C','org');
    insert into branch(id,name,code,"clusterId") values('branch','Synthetic','B','cluster');
    insert into water_scheme(id,name,code,"branchId") values('scheme-a','Synthetic A','A','branch'),('scheme-b','Synthetic B','B','branch');
    insert into "user"(id,name,email) values('manager','Synthetic manager','manager@example.invalid'),('operator','Synthetic operator','operator@example.invalid');
    insert into water_scheme_source(id,"schemeId","sourceName","capacityMethod","installedPumpCapacityM3Hr","regimeHoursPerDay","currentCapacityM3Day","practicalCapacityM3Month","capacityConfirmedAt","capacityConfirmedById")
      values('spring','scheme-a','Synthetic bucket spring','bucket_test',null,24,56.50,1694.86,null,null),
      ('pump','scheme-a','Synthetic rated pump','measured_hourly',7.5,14,105,3150,now(),'manager');
    insert into water_scheme_source(id,"schemeId","sourceName",active) values('unknown','scheme-b','Synthetic unknown',false);
    insert into water_production_log(id,"schemeId","logDate","waterProducedM3","recordedById") values('legacy-log','scheme-a','2024-07-01',810,'operator');
    insert into scheme_target(id,"schemeId","targetProductionM3","targetCollectionEfficiencyPercent") values('original-target','scheme-a',1500,null);
    insert into report_generation_history(id,"reportType","generatedById",metadata) values('old-report','monthly_management','manager','{"original":"synthetic retained report metadata"}');`);

  const before = await originalRows();
  report.beforeOriginalRowsSha256 = sha(before);
  await check('schema-only migration is transactional and rolls back cleanly', async () => {
    await client.query('begin'); await client.query(sqlFile('schema-draft.sql')); await client.query('rollback');
    assert.equal((await client.query("select to_regclass('source_capacity_assessment') as t")).rows[0].t,null);
    assert.deepEqual(await originalRows(), before);
  });
  await transaction(() => client.query(sqlFile('schema-draft.sql')));
  await check('additive schema changes no existing values or workflow states', async () => assert.deepEqual(await originalRows(),before));
  await check('new tables begin empty; schema does not initialize historical values', async () => {
    for (const table of ['source_capacity_assessment','scheme_capacity_baseline','scheme_capacity_baseline_source']) assert.equal((await client.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
  });
  await check('initialization with missing capture actor fails atomically', async () => {
    await rejects(sqlFile('legacy-capture-draft.sql'), /swuws.capture_officer_id|foreign key|null value/);
    assert.equal((await client.query('select count(*)::int as n from source_capacity_assessment')).rows[0].n,0);
  });
  await capture();
  await check('legacy capture copies every source including archived and null values exactly', async () => {
    const captured=(await client.query('select "originalSourceRow" as row from source_capacity_assessment order by "sourceId"')).rows.map(r=>r.row);
    assert.deepEqual(captured,[...before.water_scheme_source].sort((a,b)=>a.id.localeCompare(b.id)));
    assert.deepEqual(await originalRows(),before);
  });
  await check('legacy capture leaves assessment dates, measured yields and month-day assumptions unknown', async () => {
    assert.equal((await client.query('select count(*)::int as n from source_capacity_assessment where "effectiveFrom" is not null or "assessedAt" is not null or "measuredCapacityM3Hr" is not null or "benchmarkDays" is not null')).rows[0].n,0);
    assert.equal((await client.query('select count(*)::int as n from scheme_capacity_baseline')).rows[0].n,0);
  });
  await check('unknown original responsible officer remains null; capture actor is distinct provenance', async () => {
    const row=(await client.query('select "responsibleOfficerId","capturedById" from source_capacity_assessment where "sourceId"=\'spring\'')).rows[0];
    assert.deepEqual(row,{responsibleOfficerId:null,capturedById:'manager'});
  });
  await check('repeated identical capture is idempotent', async () => { await capture(); assert.equal((await client.query('select count(*)::int as n from source_capacity_assessment')).rows[0].n,3); });
  report.afterCaptureOriginalRowsSha256=sha(await originalRows());
  assert.equal(report.beforeOriginalRowsSha256,report.afterCaptureOriginalRowsSha256);

  await transaction(async () => { await baseline('baseline-1'); await member('baseline-1','spring','legacy-source:spring:v1','1694.86'); await member('baseline-1','pump','legacy-source:pump:v1','3150'); });
  await check('immutable baseline pins explicit original source contributions', async () => assert.equal((await client.query("select \"capacityM3\" from scheme_capacity_baseline where id='baseline-1'")).rows[0].capacityM3,'4844.86'));
  for (const table of ['source_capacity_assessment','scheme_capacity_baseline','scheme_capacity_baseline_source']) {
    await check(`${table}: UPDATE rejected`, () => rejects(`update ${table} set provenance=provenance`,/immutable/));
    await check(`${table}: DELETE rejected`, () => rejects(`delete from ${table}`,/immutable/));
    await check(`${table}: TRUNCATE rejected`, () => rejects(`truncate ${table} cascade`,/immutable/));
  }
  await check('baseline members cannot be appended after the creation transaction', async () => {
    await assert.rejects(member('baseline-1','pump','legacy-source:pump:v1','0'),/sealed/);
  });
  await check('missing source membership rejects baseline at commit', async () => {
    await assert.rejects(transaction(async () => { await baseline('missing',{revision:2,supersedes:'baseline-1'}); await member('missing','spring','legacy-source:spring:v1','4844.86'); }),/membership is incomplete/);
  });
  await check('mismatched complete scheme total rolls back baseline and all members', async () => {
    await assert.rejects(transaction(async () => { await baseline('wrong-total',{revision:2,supersedes:'baseline-1',capacity:'1'}); await member('wrong-total','spring','legacy-source:spring:v1','1694.86'); await member('wrong-total','pump','legacy-source:pump:v1','3150'); }),/equal its known source contributions/);
  });
  await check('baseline cannot link an assessment from another scheme', async () => {
    await assert.rejects(transaction(async () => { await baseline('wrong-scheme',{revision:2,supersedes:'baseline-1',count:1,capacity:'0'}); await member('wrong-scheme','unknown','legacy-source:unknown:v1','0'); }),/foreign key/);
  });
  await check('incomplete baseline retains null capacity rather than inventing zero', async () => {
    await transaction(async () => { await baseline('baseline-2',{revision:2,supersedes:'baseline-1',capacity:null,completeness:'incomplete'}); await member('baseline-2','spring','legacy-source:spring:v1',null); await member('baseline-2','pump','legacy-source:pump:v1','3150'); });
    assert.equal((await client.query("select \"capacityM3\" from scheme_capacity_baseline where id='baseline-2'")).rows[0].capacityM3,null);
    assert.equal((await client.query("select \"capacityM3\" from scheme_capacity_baseline where id='baseline-1'")).rows[0].capacityM3,'4844.86');
  });
  await check('new revision cannot fork or replace a pinned historical baseline', async () => {
    await assert.rejects(transaction(()=>baseline('fork',{revision:2,supersedes:'baseline-1'})),/unique|duplicate/);
  });
  const pinnedBefore = (await client.query("select to_jsonb(b) as b from scheme_capacity_baseline b where id='baseline-1'")).rows[0].b;
  await check('current source edits and archive do not alter pinned baseline or actual production', async () => {
    await client.query("update water_scheme_source set \"currentCapacityM3Day\"=200,\"practicalCapacityM3Month\"=null,version=version+1 where id='spring'");
    await client.query("update water_scheme_source set active=false,version=version+1 where id='pump'");
    assert.deepEqual((await client.query("select to_jsonb(b) as b from scheme_capacity_baseline b where id='baseline-1'")).rows[0].b,pinnedBefore);
    const after=await originalRows(); assert.deepEqual(after.water_production_log,before.water_production_log); assert.deepEqual(after.scheme_target,before.scheme_target); assert.deepEqual(after.report_generation_history,before.report_generation_history);
    assert.equal((await client.query("select sum(\"currentCapacityM3Day\")::text as n from water_scheme_source where active=true and \"schemeId\"='scheme-a'")).rows[0].n,'200.00');
  });
  await check('same-version drift fails legacy capture instead of overwriting preserved history', async () => {
    await rejects("update water_scheme_source set \"currentCapacityM3Day\"=9 where id='spring'",/version conflict/);
    // Valid version increment gives a new snapshot identity; old snapshot must remain unchanged.
    const old=(await client.query("select \"capacityM3Day\" from source_capacity_assessment where id='legacy-source:spring:v1'")).rows[0].capacityM3Day;
    await capture(); assert.equal((await client.query("select \"capacityM3Day\" from source_capacity_assessment where id='legacy-source:spring:v1'")).rows[0].capacityM3Day,old);
    await client.query('begin');
    try {
      await client.query("select set_config('swuws.capture_officer_id','manager',true)");
      // A persisted inconsistent capture cannot be created without bypassing immutability;
      // transactionally alter the test row with the existing version guard disabled ONLY here.
      await client.query('alter table water_scheme_source disable trigger production_source_guard');
      await client.query("update water_scheme_source set \"currentCapacityM3Day\"=9 where id='spring'");
      await assert.rejects(client.query(sqlFile('legacy-capture-draft.sql')),/does not exactly match/);
    } finally { await client.query('rollback'); }
  });
  await check('source FK prevents removing preserved assessment identity', () => rejects("delete from water_scheme_source where id='spring'",/foreign key/));
  await check('nonfinite new capacity is rejected', () => rejects("insert into source_capacity_assessment select 'invalid-number',\"sourceId\",\"schemeId\",999,\"assessmentKind\",null,methodology,\"methodologyVersion\",\"assessedAt\",\"effectiveFrom\",\"recordedAt\",\"responsibleOfficerId\",\"capturedById\",\"recordedInstalledPumpCapacityM3Hr\",\"measuredCapacityM3Hr\",\"regimeHoursPerDay\",'NaN'::numeric,\"benchmarkCapacityM3Month\",\"benchmarkDays\",\"sourceWasActive\",assumptions,provenance,\"originalSourceRow\" from source_capacity_assessment where id='legacy-source:spring:v1'",/check constraint/));
  await check('new assessment requires responsible officer and rejects historical effective date', async () => {
    const sql=`insert into source_capacity_assessment(id,"sourceId","schemeId","sourceVersion","assessmentKind",methodology,"methodologyVersion","assessedAt","effectiveFrom","responsibleOfficerId","capturedById","sourceWasActive",assumptions,provenance) values('backdated','spring','scheme-a',3,'new_assessment','bucket_test','v1',now(),'2024-07-01','manager','manager',true,'{}','{"test":"backdate rejected"}')`;
    await rejects(sql,/cannot backdate/);
    await rejects(sql.replace("'2024-07-01'","current_date").replace("'manager','manager',true","null,'manager',true"),/check constraint/);
  });
  await check('new measured assessment retains installed rating separately and leaves pinned history unchanged', async () => {
    await client.query(`insert into source_capacity_assessment(id,"sourceId","schemeId","sourceVersion","assessmentKind","supersedesId",methodology,"methodologyVersion","assessedAt","effectiveFrom","responsibleOfficerId","capturedById","recordedInstalledPumpCapacityM3Hr","measuredCapacityM3Hr","regimeHoursPerDay","capacityM3Day","benchmarkCapacityM3Month","benchmarkDays","sourceWasActive",assumptions,provenance)
      values('new-pump-assessment','pump','scheme-a',2,'new_assessment','legacy-source:pump:v1','rated_pump_with_confirmatory_measurement','fixture-v1',now(),(now() at time zone 'Africa/Kampala')::date,'manager','manager',21,16.4,5,105,3150,30,false,'{"capacityBasis":"installed rating, per KIGEZI M31","measuredUnit":"m3/hour","installedUnit":"m3/hour"}','{"workbookExample":"KIGEZI H31,L31,M31","synthetic":true}')`);
    const r=(await client.query("select \"recordedInstalledPumpCapacityM3Hr\",\"measuredCapacityM3Hr\",\"capacityM3Day\" from source_capacity_assessment where id='new-pump-assessment'")).rows[0];
    assert.deepEqual(r,{recordedInstalledPumpCapacityM3Hr:'21',measuredCapacityM3Hr:'16.4',capacityM3Day:'105'});
    assert.deepEqual((await client.query("select to_jsonb(b) as b from scheme_capacity_baseline b where id='baseline-1'")).rows[0].b,pinnedBefore);
    assert.equal((await client.query("select \"capacityM3Day\" from source_capacity_assessment where id='legacy-source:pump:v1'")).rows[0].capacityM3Day,'105.00');
  });
  await check('existing universal self-approval trigger rejects a version-correct legacy update', async () => {
    await rejects("update water_production_log set status='verified',\"verifiedById\"='operator',\"verifiedAt\"=now(),version=version+1 where id='legacy-log'",/Self-approval is forbidden/);
    assert.deepEqual((await originalRows()).water_production_log,before.water_production_log);
  });

  const examples=[];
  await check('workbook KIGEZI K2:L2:M2:N2 source chain retains original 30-day basis', async () => {
    const r=(await client.query('select 15::numeric/22.94 as lps,15::numeric/22.94*3.6 as hourly,15::numeric/22.94*3.6*24 as daily,15::numeric/22.94*3.6*24*30 as monthly')).rows[0];
    assert.ok(Math.abs(Number(r.lps)-0.6538796861377506)<1e-12); assert.ok(Math.abs(Number(r.monthly)-1694.8561464690495)<1e-9); examples.push({cells:'KIGEZI!K2:N2',result:r});
  });
  await check('workbook RUJUMBURA L4 and L8 bulk-meter methods keep explicit dial assumptions', async () => {
    const r=(await client.query('select 3600::numeric*10*0.01/37.5 as dial_small,3600::numeric*10*0.1/309 as dial_large')).rows[0];
    assert.equal(Number(r.dial_small),9.6); assert.ok(Math.abs(Number(r.dial_large)-11.650485436893204)<1e-12); examples.push({cells:'RUJUMBURA!L4,L8',result:r});
  });
  await check('workbook KIGEZI M3:N3 mixed-source scheme uses each source regime once', async () => {
    const r=(await client.query('select 7.5::numeric*14+(15::numeric/19.11*3.6)*24 as daily,(7.5::numeric*14+(15::numeric/19.11*3.6)*24)*30 as monthly')).rows[0];
    assert.ok(Math.abs(Number(r.daily)-172.81789638932497)<1e-10); assert.ok(Math.abs(Number(r.monthly)-5184.536891679749)<1e-9); examples.push({cells:'KIGEZI!M3:N3',result:r});
  });
  await check('workbook ISINGIRO M10 as-written capacity is preserved without correcting its reference', async () => {
    const r=(await client.query('select 47.8::numeric*16+(15::numeric/3.5)*8 as as_written,47.8::numeric*16+(15::numeric/3.5*3.6)*8 as diagnostic_only')).rows[0];
    assert.ok(Math.abs(Number(r.as_written)-799.0857142857144)<1e-10); assert.notEqual(r.as_written,r.diagnostic_only); examples.push({cells:'ISINGIRO!M10',result:r,notice:'Diagnostic result is not an approved baseline replacement'});
  });
  report.workbookExamples=examples;
  report.status='passed'; report.passed=checks.length;
  report.scope='Draft database constraints and exact-copy initialization tested on synthetic rows only; no application integration implemented, no live data validation';
  report.createdAt=new Date().toISOString();
  fs.writeFileSync(path.join(__dirname,'isolated-proof-results.json'),JSON.stringify(report,null,2));
  console.log(`RESULT ${checks.length} checks passed; original-row hashes match before/after initialization`);
})().catch(error=>{report.status='failed';report.error=error.message;fs.writeFileSync(path.join(__dirname,'isolated-proof-results.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;}).finally(async()=>{await client?.end();});
