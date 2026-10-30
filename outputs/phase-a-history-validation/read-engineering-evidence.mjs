// Engineering-only business evidence reader. Never imports application modules or executes migrations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
const { Client } = pg;
const root = process.cwd();
const out = path.join(root,'.artifacts/phase-a-history-review');
fs.mkdirSync(out,{recursive:true});
const env = {};
const envFile = path.join(root,'.env');
if(fs.existsSync(envFile)) for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)) {
 const m=line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
 if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,'');
}
const urlValue=process.env.DATABASE_URL || env.DATABASE_URL;
if(!urlValue) throw new Error('No configured DATABASE_URL; no connection attempted');
const url=new URL(urlValue);
const client=new Client({host:url.hostname,port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),ssl:['127.0.0.1','localhost'].includes(url.hostname)?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000,options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000',max:1});
const evidence={captureKind:'business_read_only_engineering_inventory',capturedAt:new Date().toISOString(),connectionIdentity:crypto.createHash('sha256').update(url.hostname+':'+url.port+'/'+url.pathname).digest('hex'),records:{},limitations:[]};
try {
 await client.connect();
 await client.query('begin isolation level repeatable read read only');
 evidence.transactionReadOnly=(await client.query('show transaction_read_only')).rows[0].transaction_read_only;
 if(evidence.transactionReadOnly!=='on') throw new Error('Read-only transaction verification failed');
 const tables=(await client.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name = any($1::text[]) order by table_name,ordinal_position",[['water_scheme_source','water_production_log','water_scheme','branch','cluster','billing_period','decision_support_scheme_mapping','report_generation_history','audit_log','scheme_target','schema_migrations']])).rows;
 evidence.columns=tables;
 const cols=table=>new Set(tables.filter(r=>r.table_name===table).map(r=>r.column_name));
 async function read(table,wanted,extra='') {
  const available=cols(table);
  if(!available.size){evidence.limitations.push(`Table unavailable: ${table}`);return [];}
  const selected=wanted.filter(c=>available.has(c));
  const missing=wanted.filter(c=>!available.has(c));
  if(missing.length)evidence.limitations.push(`${table} missing columns: ${missing.join(', ')}`);
  const result=await client.query(`select ${selected.map(c=>'"'+c+'"').join(',')} from public."${table}" ${extra}`);
  evidence.records[table]=result.rows;
  return result.rows;
 }
 await read('schema_migrations',['filename','applied_at'],"where filename like '006%' or filename like '007%' order by filename");
 await read('water_scheme',['id','name','code','branchId','active'],'order by id');
 await read('branch',['id','name','clusterId'],'order by id');
 await read('cluster',['id','name','organizationId'],'order by id');
 await read('water_scheme_source',['id','schemeId','sourceName','technology','installedPumpCapacityM3Hr','regimeHoursPerDay','containerVolumeLitres','averageFillTimeSeconds','productionCapacityLSec','currentCapacityM3Day','practicalCapacityM3Month','active','capacityMethod','capacityConfirmedAt','capacityConfirmedById','version','createdAt','updatedAt'],'order by id');
 await read('billing_period',['id','periodName','year','month','status','startDate','endDate'],'order by year,month,id');
 await read('water_production_log',['id','schemeId','sourceId','billingPeriodId','productionDate','logDate','workflowVersion','waterProducedM3','waterSuppliedM3','operatingHours','status','recordedById','verifiedById','verifiedAt','version','createdAt','updatedAt'],'order by id');
 await read('decision_support_scheme_mapping',['id','waterSchemeId','excelArea','excelSchemeName','matchStatus','matchMethod','approved','approvedById','approvedAt','source'],'order by id');
 const rh=cols('report_generation_history');
 if(rh.has('metadata')) evidence.records.report_generation_history=(await client.query(`select id,"reportType","periodId","scopeLevel","scopeId","createdAt",jsonb_build_object('periodName',metadata->'periodName','waterProducedM3',metadata->'waterProducedM3','practicalCapacityM3Month',metadata->'practicalCapacityM3Month','capacityBaselineIds',metadata->'capacityBaselineIds','capacityBasis',metadata->'capacityBasis') as "capacityMetadata" from public.report_generation_history order by id`)).rows;
 const ac=cols('audit_log');
 if(ac.has('details')) evidence.records.source_capacity_audit=(await client.query(`select id,action,"entityId","userId","createdAt",jsonb_build_object('id',details->'before'->'id','schemeId',details->'before'->'schemeId','version',details->'before'->'version','active',details->'before'->'active','currentCapacityM3Day',details->'before'->'currentCapacityM3Day','practicalCapacityM3Month',details->'before'->'practicalCapacityM3Month','capacityMethod',details->'before'->'capacityMethod','capacityConfirmedAt',details->'before'->'capacityConfirmedAt') as "beforeCapacity",jsonb_build_object('id',details->'after'->'id','schemeId',details->'after'->'schemeId','version',details->'after'->'version','active',details->'after'->'active','currentCapacityM3Day',details->'after'->'currentCapacityM3Day','practicalCapacityM3Month',details->'after'->'practicalCapacityM3Month','capacityMethod',details->'after'->'capacityMethod','capacityConfirmedAt',details->'after'->'capacityConfirmedAt') as "afterCapacity" from public.audit_log where "entityType"='water_scheme_source' order by "createdAt",id`)).rows;
 await client.query('rollback');
 evidence.status='complete';
 fs.writeFileSync(path.join(out,'business-engineering-evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:evidence.status,transactionReadOnly:evidence.transactionReadOnly,counts:Object.fromEntries(Object.entries(evidence.records).map(([k,v])=>[k,v.length])),limitations:evidence.limitations}));
} catch(error) {
 try{await client.query('rollback');}catch{}
 const safe=String(error.code||error.name||'READ_FAILED');
 evidence.status='failed';evidence.errorCode=safe;
 fs.writeFileSync(path.join(out,'business-engineering-evidence-attempt.json'),JSON.stringify(evidence,null,2));
 console.error('Read-only engineering inventory failed: '+safe);
 process.exitCode=1;
} finally {await client.end();}
