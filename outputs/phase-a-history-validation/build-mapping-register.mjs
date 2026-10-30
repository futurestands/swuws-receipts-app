import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
const out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const file='C:/Users/MJ/Downloads/global target (1).xlsx';
const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previous=JSON.parse(fs.readFileSync('outputs/engineering-basis-review/workbook-evidence.json','utf8'));
if(hash!==previous.sha256)throw new Error('Workbook differs from reviewed evidence; stop reconciliation');
const wb=XLSX.readFile(file,{cellFormula:true,cellDates:true});
const db=JSON.parse(fs.readFileSync('.artifacts/phase-a-history-review/business-engineering-evidence.json','utf8'));
if(db.status!=='complete'||db.transactionReadOnly!=='on')throw new Error('No verified read-only inventory');
const norm=s=>String(s??'').trim().toLowerCase();
const branch=new Map(db.records.branch.map(x=>[x.id,x]));
const cell=(sheet,ref)=>{const c=wb.Sheets[sheet][ref];return {sheet,cell:ref,value:c?.t==='e'?c.w:c?.v??null,formula:c?.f?'='+c.f:null,type:c?.t??'blank'};};
const raw=(sheet,ref)=>cell(sheet,ref).value;
const schemeAssessments=[];const sourceAssessments=[];let area='';
for(const sheet of ['KIGEZI','RUJUMBURA','ISINGIRO','ANKOLE']){
 const s=wb.Sheets[sheet];let current;
 const end=XLSX.utils.decode_range(s['!ref']).e.r+1;
 for(let row=1;row<=end;row++){
  const tech=raw(sheet,'F'+row);if(!tech||tech==='Technology')continue;
  if(raw(sheet,'B'+row))area=raw(sheet,'B'+row);
  const scheme=raw(sheet,'D'+row);
  if(scheme&&scheme!=='Scheme Name'){
   current={referenceId:`wb:${hash}:${sheet}:D${row}`,sheet,row,area,schemeName:scheme,assessmentDate:null,effectiveFrom:null,effectiveTo:null,responsibleOfficerId:null,sourceReferences:[],daily:cell(sheet,'M'+row),monthly:cell(sheet,'N'+row),dayBasisEvidence:cell(sheet,'N'+row).formula?.includes('*30')?'explicit_30_day_formula':null};
   schemeAssessments.push(current);
  }
  if(!current)throw new Error('Source without owning scheme '+sheet+row);
  const volumeCol=sheet==='KIGEZI'?'I':'H',installedCol=sheet==='KIGEZI'?'H':'I';
  const fields={technology:cell(sheet,'F'+row),regimeHours:cell(sheet,'G'+row),recordedInstalled:cell(sheet,installedCol+row),containerLitres:cell(sheet,volumeCol+row),timeSeconds:cell(sheet,'J'+row),yieldLps:cell(sheet,'K'+row),hourly:cell(sheet,'L'+row),daily:cell(sheet,'M'+row),monthly:cell(sheet,'N'+row)};
  const flags=[];let method='recorded_yield_or_capacity_method_unconfirmed';
  if(fields.hourly.formula?.includes('3600*10'))method='bulk_meter_dial_timing_constants_explicit';
  else if(fields.timeSeconds.formula)method='fill_time_back_calculated_from_yield';
  else if(fields.yieldLps.formula?.includes('/J')&&Number(fields.containerLitres.value)>0&&Number(fields.timeSeconds.value)>0)method='volumetric_timing_from_recorded_inputs';
  else if(fields.hourly.formula===`=${installedCol}${row}`||current.daily.formula?.includes(`${installedCol}${row}`))method='installed_rating_selected_with_operating_regime';
  if(!raw(sheet,'E'+row))flags.push('source_name_missing_use_cell_identity');
  if(fields.hourly.formula&&[...fields.hourly.formula.matchAll(/[A-Z]+(\d+)/g)].some(m=>Number(m[1])!==row))flags.push('hourly_cell_combines_multiple_source_rows_do_not_duplicate');
  if(Object.values(fields).some(x=>x.type==='e'))flags.push('saved_error_in_source_row');
  if(method==='fill_time_back_calculated_from_yield')flags.push('not_an_independent_stopwatch_observation');
  if(sheet==='KIGEZI'&&row===9)flags.push('Noozi_volume_time_yield_hourly_disagree');
  if(sheet==='KIGEZI'&&row===31)flags.push('installed_rating_21_differs_from_measured_16_4_selected_daily_uses_rating');
  if(sheet==='ISINGIRO'&&row===9)flags.push('L_per_second_field_matches_m3_hour_field_unit_uncertain');
  if(sheet==='ISINGIRO'&&[10,11].includes(row))flags.push('scheme_formula_uses_K11_instead_of_L11_dimensional_conflict');
  if(sheet==='ANKOLE'&&row===19)flags.push('second_borehole_yield_and_regime_missing_zero_formula_is_not_measurement');
  if(['Eye I','Eye II'].includes(String(tech)))flags.push('technology_label_is_source_eye_not_verified_technology');
  const source={referenceId:`wb:${hash}:${sheet}:row${row}`,schemeReferenceId:current.referenceId,schemeName:current.schemeName,area,sheet,row,sourceName:raw(sheet,'E'+row),sourceNameCell:'E'+row,technologyLabel:tech,methodEvidence:method,fields,flags,assessmentDate:null,effectiveFrom:null,effectiveTo:null,responsibleOfficerId:null,databaseSourceId:null,databaseSourceRelationship:'NO_REGISTERED_SOURCE_RECORDS',historicalPeriodEligibility:'UNRESOLVED_DATE_AND_SOURCE_ID',archiveEligibility:'VERIFIED_WORKBOOK_CONTENT_ONLY'};
  sourceAssessments.push(source);current.sourceReferences.push(source.referenceId);
 }
}
const byName=new Map(schemeAssessments.map(s=>[norm(s.schemeName),s]));
const aliases={'kisoro & kanungu':['kisoro','kanungu'],'rugaga':['rugaaga']};
const manualCandidates={'karukara':['KARUKARA- HAMURWA'],'rushaga':[],'kakigani':[],'isingiro t/c & kyakabindi':['ISINGIRO T/C','KYAKABINDI-KAHIRIMBI'],'rwentango':['RWENTAGO'],'matsyoro':['MASTYORO'],'kanyarugiri':['KANYARUGYIRI'],'kisenyi':['KISHENYI']};
let globalArea='';const schemeMappings=[];const periodRelationships=[];
for(let row=3;row<=69;row++){
 if(raw('GLOBAL SUMMERY','B'+row))globalArea=raw('GLOBAL SUMMERY','B'+row);
 const name=raw('GLOBAL SUMMERY','D'+row);if(!name)continue;
 const assess=byName.get(norm(name));if(!assess)throw new Error('Missing source sheet scheme '+name);
 const exact=db.records.water_scheme.filter(x=>norm(x.name)===norm(name));
 const candidate=exact.length===1?exact[0]:null;
 const branchName=candidate?branch.get(candidate.branchId)?.name??null:null;
 const hierarchyCoherent=!!candidate&&[norm(globalArea),...(aliases[norm(globalArea)]||[])].includes(norm(branchName));
 const status=!candidate?'MANUAL_IDENTITY_INVESTIGATION':!hierarchyCoherent?'HIERARCHY_CONFLICT':'NAME_AND_HIERARCHY_CANDIDATE_NOT_APPROVED';
 const targetRow=Object.keys(wb.Sheets['TARGETS GOLBAL']).find(k=>/^D\d+$/.test(k)&&norm(raw('TARGETS GOLBAL',k))===norm(name));
 const mapping={referenceId:`wb:${hash}:GLOBAL SUMMERY:D${row}`,schemeName:name,workbookArea:globalArea,globalRow:row,assessmentReferenceId:assess.referenceId,sourceReferences:assess.sourceReferences,daily:cell('GLOBAL SUMMERY','E'+row),monthly:cell('GLOBAL SUMMERY','F'+row),sourceSheetDaily:assess.daily,sourceSheetMonthly:assess.monthly,copiedCapacityDifference:{daily:Number(raw('GLOBAL SUMMERY','E'+row))-Number(assess.daily.value),monthly:Number(raw('GLOBAL SUMMERY','F'+row))-Number(assess.monthly.value)},targetRow:targetRow?Number(targetRow.slice(1)):null,databaseCandidateId:candidate?.id??null,databaseCandidateName:candidate?.name??null,databaseCandidateBranch:branchName,identityStatus:status,approvedDatabaseMappingId:null,investigationOnlyCandidates:(manualCandidates[norm(name)]||[]).map(n=>db.records.water_scheme.find(x=>norm(x.name)===norm(n))).filter(Boolean).map(x=>({id:x.id,name:x.name,branch:branch.get(x.branchId)?.name})),assessmentDate:null,effectiveFrom:null,reportingYear:null,billingPeriodId:null,historicalBackfillEligible:false,archiveEligible:true};
 schemeMappings.push(mapping);
 for(const [label,prod,sold]of [['July','G','M'],['August','H','N'],['September','I','O']]){
  const p=cell('GLOBAL SUMMERY',prod+row),s=cell('GLOBAL SUMMERY',sold+row);
  periodRelationships.push({schemeReferenceId:mapping.referenceId,schemeName:name,periodLabel:label,year:null,databaseBillingPeriodId:null,assessmentEffectiveDate:null,comparisonBaseline:mapping.assessmentReferenceId,production:p,sold:s,relationship:'EXPLICIT_WORKBOOK_COMPARISON_NOT_CALENDAR_EFFECTIVITY',status:p.value===null&&s.value===null?'NO_OBSERVATIONS_REMAIN_UNCHANGED':'PRESERVE_AS_UNDATED_WORKBOOK_OBSERVATIONS',historicalBackfillEligible:false});
 }
}
const dates=wb.SheetNames.flatMap(n=>Object.entries(wb.Sheets[n]).filter(([,c])=>c.t==='d').map(([k,c])=>({sheet:n,cell:k,value:c.v})));
const summary={workbook:file,workbookSha256:hash,businessEvidenceCapturedAt:db.capturedAt,businessTransactionReadOnly:db.transactionReadOnly,sourceAssessmentCount:sourceAssessments.length,schemeAssessmentCount:schemeAssessments.length,schemeMappingCount:schemeMappings.length,sourceAssessmentDateCount:0,typedWorkbookDateCellCount:dates.length,confirmedCalendarPeriodMappingCount:0,eligibleHistoricalDatabaseBackfillCount:0,approvedDatabaseMappingCount:db.records.decision_support_scheme_mapping.filter(r=>r.approved).length,databaseCounts:Object.fromEntries(Object.entries(db.records).map(([k,v])=>[k,v.length])),identityCandidateCounts:Object.fromEntries([...new Set(schemeMappings.map(s=>s.identityStatus))].map(k=>[k,schemeMappings.filter(s=>s.identityStatus===k).length])),periodCounts:Object.fromEntries(['July','August','September'].map(k=>[k,{rows:periodRelationships.filter(p=>p.periodLabel===k).length,nonblankProduction:periodRelationships.filter(p=>p.periodLabel===k&&p.production.value!==null).length,nonblankSales:periodRelationships.filter(p=>p.periodLabel===k&&p.sold.value!==null).length}])),notice:'Workbook values are copied evidence. No source, year, assessment date, billing period or approval is inferred. No business INSERT/UPDATE/DELETE executed.'};
const register={summary,sourceAssessments,schemeAssessments,schemeMappings,periodRelationships};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'historical-mapping-register.json'),JSON.stringify(register,null,2));
let md='# Historical mapping register\n\nAll historical effective dates, reporting years and database billing-period assignments remain unresolved. No row is approved for historical database backfill. Content may be retained as undated workbook evidence; content verification is not engineering approval or live identity approval.\n\n';
md+='## All 64 scheme relationships\n\n| Scheme | Workbook source group | Daily / monthly m³ | Candidate live ID | Live branch | Identity status | Historical month eligibility |\n|---|---|---|---|---|---|---|\n';
for(const m of schemeMappings){const a=schemeAssessments.find(a=>a.referenceId===m.assessmentReferenceId);md+=`| ${m.schemeName.trim()} | ${a.sheet}!D${a.row}; source rows ${sourceAssessments.filter(s=>s.schemeReferenceId===a.referenceId).map(s=>s.row).join(', ')} | ${m.daily.value} / ${m.monthly.value} | ${m.databaseCandidateId??'unresolved'} | ${m.databaseCandidateBranch??'unresolved'} | ${m.identityStatus} | unresolved year/date; no source ID |\n`;}
md+='\n## All 92 source assessment relationships\n\n| Workbook source key | Owning scheme | Recorded source name | Method evidence | Recorded hourly m³/h | Installed field m³/h | Regime h/day | Qualifications |\n|---|---|---|---|---|---|---|---|\n';
for(const s of sourceAssessments)md+=`| ${s.sheet}:row${s.row} | ${s.schemeName.trim()} | ${s.sourceName??'(name missing)'} | ${s.methodEvidence} | ${s.fields.hourly.value??'unknown'} | ${s.fields.recordedInstalled.value??'unknown'} | ${s.fields.regimeHours.value??'unknown'} | ${s.flags.join('; ')||'No additional row flag; date/officer/source ID remain unknown'} |\n`;
md+='\n## Investigation-only identity candidates\n\n';for(const m of schemeMappings.filter(s=>s.identityStatus!=='NAME_AND_HIERARCHY_CANDIDATE_NOT_APPROVED'))md+=`- ${m.schemeName.trim()}: ${m.identityStatus}; ${m.investigationOnlyCandidates.length?m.investigationOnlyCandidates.map(c=>c.name+' ('+c.id+', '+c.branch+')').join('; '):m.databaseCandidateId?'name match '+m.databaseCandidateId+', branch '+m.databaseCandidateBranch:'no reviewed candidate'}. No automatic mapping.\n`;
md+='\nThe JSON companion enumerates all 192 scheme/month-label relationships, exact original cells and formulas, source flags and candidate IDs. September blank observations are not zeroes.\n';
fs.writeFileSync(path.join(out,'historical-mapping-register.md'),md);console.log(JSON.stringify(summary,null,2));
