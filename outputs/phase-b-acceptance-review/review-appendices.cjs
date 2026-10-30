/* eslint-disable @typescript-eslint/no-require-imports */
// File-only review appendices. Does not load pg, application services, migrations or environment credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = path.join(process.cwd(), 'outputs/phase-b-acceptance-review');
const json = name => JSON.parse(fs.readFileSync(path.join(dir,name),'utf8').replace(/^\uFEFF/,''));
const e = json('workbook-and-design-evidence.json');
const errorsOnly = e.previousEvidenceDifferences.every(d => d.previous.type === 'e' && d.previous.value === '#DIV/0!' && d.current.value === 7 && (d.previous.formula??'').replace(/^=/,'') === (d.current.formula??''));
const verification = { workbookSha256: e.sha256, sheetsRead: e.sheetCount, formulasRead: e.formulaCount,
  externalFormulas: e.externalFormulaCount, savedErrorCells: e.savedErrorCount,
  normalizedOriginalEvidenceDifferences: errorsOnly ? 0 : e.previousEvidenceDifferences.length,
  encodingNote: 'All 19 raw comparison differences are identical saved #DIV/0! errors: SheetJS raw error code 7 versus prior decoded error text. Formula text agrees and complete workbook SHA-256 matches.',
  replayedTargetFormulaCount: e.comparisons.filter(c=>c.localValue!==null).length,
  lmpqComparisons: e.comparisons.filter(c=>!/!S/.test(c.source)&&c.localValue!==null).length,
  demandComparisons: e.comparisons.filter(c=>/!S/.test(c.source)&&c.localValue!==null),
  maximumAbsoluteDifference: Math.max(...e.comparisons.map(c=>c.absoluteDifference??0)),
  unresolvedResults: e.comparisons.filter(c=>c.localValue===null).length,
  noSqlExecuted: true, noBusinessConnections: true };
fs.writeFileSync(path.join(dir,'workbook-verification.json'),JSON.stringify(verification,null,2),{flag:'wx'});
function splitTopLevel(text) {
  let depth=0, quote=null, start=0; const parts=[];
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quote){if(c===quote){if(text[i+1]===quote)i++;else quote=null;}continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){parts.push(text.slice(start,i).trim());start=i+1;}
  }
  parts.push(text.slice(start).trim()); return parts;
}
const schema = fs.readFileSync('outputs/phase-a-baseline-proposal/schema-draft.sql','utf8');
const tables = e.ddl.tables.map(t=>({...t,items:splitTopLevel(t.definition)}));
const lineOf = needle => schema.slice(0,schema.indexOf(needle)).split('\n').length;
const md = ['# Persistence draft inventory', '', 'Static inspection only. No SQL was executed. No registered Phase B migration, Drizzle mapping, target-version DDL or report-baseline foreign key exists. The two existing SQL review drafts remain unmodified under `outputs/phase-a-baseline-proposal/`.', '',
  'Counts: 3 proposed tables, 25 CHECK constraints, 9 foreign keys, 3 primary keys, 6 table/inline UNIQUE constraints, 2 explicitly named indexes, 4 functions and 11 triggers. The three primary keys and six UNIQUE constraints imply nine additional unique indexes if deployed. PostgreSQL has not assigned actual names to unnamed constraints/indexes in this review.', '',
  'Every column definition below includes its exact type, nullability, default and inline constraints. The subsequent table constraints complete the inventory. SQL text is reproduced as evidence, not as an approved migration.', ''];
for(const table of tables){
  md.push(`## ${table.name}`, '', `Draft starts at schema-draft.sql:${lineOf('CREATE TABLE '+table.name+' (')}.`, '', '| Column | Exact definition after name |', '| --- | --- |');
  const constraints=[];
  for(const item of table.items){
    if(/^(?:UNIQUE|FOREIGN KEY|CHECK|PRIMARY KEY)\b/.test(item)){constraints.push(item);continue;}
    const match=item.match(/^("?\w+"?)\s+([\s\S]+)$/);
    md.push(`| ${match[1]} | \`${match[2].replace(/\s+/g,' ').replace(/\|/g,'\\|')}\` |`);
  }
  md.push('', 'Table constraints:', '', ...constraints.map((c,i)=>`${i+1}. \`${c.replace(/\s+/g,' ')}\``), '');
}
md.push('## Explicit indexes', '', ...e.ddl.explicitIndexes.map(s=>`- \`${s}\``), '', '## Implicit unique indexes', '',
  '- source_capacity_assessment: primary key (id); UNIQUE (supersedesId); UNIQUE (id, sourceId, schemeId).',
  '- scheme_capacity_baseline: primary key (id); UNIQUE (supersedesId); UNIQUE (schemeId, periodMonth, revision); UNIQUE (id, schemeId); UNIQUE (id, schemeId, periodMonth).',
  '- scheme_capacity_baseline_source: primary key (baselineId, sourceId).', '',
  '## Functions', '', ...e.ddl.functions.map(name=>`- \`${name}\`, schema-draft.sql:${lineOf('CREATE FUNCTION '+name+'(')}.`), '',
  '## Triggers', '', ...e.ddl.triggers.map(t=>`- \`${t.replace(/\s+/g,' ')}\``), '',
  '## Grants and registration', '',
  '`REVOKE ALL ON source_capacity_assessment,scheme_capacity_baseline,scheme_capacity_baseline_source FROM PUBLIC` is the only grant statement. No ENABLE ROW LEVEL SECURITY, organisation ownership column, deployment-role grant or application writer is supplied. Existing service scope enforcement must be reused and verified before deployment.', '',
  '`db/migrate.js` discovers only db/migrations/*.sql. Neither schema-draft.sql nor legacy-capture-draft.sql is registered there. No new migration number is assigned. The legacy capture draft performs INSERT SELECT and a verification block; it is historical population, not harmless DDL, and must not run under this review.', '',
  '## Required design corrections or proofs before approval', '',
  '- Effective-period membership: no constraint links assessment.effectiveFrom to baseline.periodMonth. Same-source/same-scheme FKs are not an effective-date policy. Define whole-month selection versus dated segments, explicit approval and report-version pinning before implementing either.',
  '- Derivation: a complete baseline must equal its source contributions, but contributions are not constrained to assessment capacities, selected units, activity, day count or effective intervals. A canonical reviewed calculation and provenance contract are required.',
  '- Calendar basis: dayCount accepts 1–366 and is not checked against the selected calendar month. Original fixed-day and preserved-report bases must remain separate.',
  '- Assessment lineage: no source-assessment guard requires a predecessor, rejects a self-predecessor, validates effective-date ordering, or uniquely versions new assessments by sourceVersion. Existing UNIQUE supersedesId prevents a fork only when a predecessor is supplied. Negative SQL tests are required in a separately approved disposable environment.',
  '- Report pinning: there is no reportGenerationHistory.baselineId FK or immutable report-to-baseline link table. A metadata label is not a pinned selection. No MPS/TPS target-version/approval/period schema is specified.',
  '- Provenance JSON checks enforce nonempty-object shape, not required evidence fields. Methodology version can be empty; new-assessment capacity values can remain null. These states require explicit service validation and unavailable-state reporting, not invented values.',
  '- Scope: source, scheme and officer FKs do not enforce that the authenticated actor is authorised for that organisation or scheme. REVOKE PUBLIC does not establish application-role permissions or RLS safety.',
  '- FK impact: ON DELETE RESTRICT will block deletion of referenced users, source identities and schemes after rows exist. Soft source archive remains possible. Review cleanup/deletion paths and audit retention before migration approval.', '',
  'None of these findings is an approved schema change. The existing draft is preserved, and no SQL was run to test hypothetical counterexamples in this review.');
fs.writeFileSync(path.join(dir,'persistence-inventory.md'),md.join('\n')+'\n',{flag:'wx'});
const protectedRecords = json('preservation-before.json').files;
const preservation = protectedRecords.map(f=>({...f,afterSha256:crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex')}));
const summary={protectedFileCount:preservation.length,unchanged:preservation.every(f=>f.sha256===f.afterSha256),files:preservation};
fs.writeFileSync(path.join(dir,'preservation-after.json'),JSON.stringify(summary,null,2),{flag:'wx'});
const inv = ['# Initial untracked work inspection', '', 'All 30 initially untracked files were read in full by the review harness; JSON files were parsed and traversed. The 17 tracked modifications were inspected through diffs and affected implementations. Their hashes, the untracked files and the original workbook are protected by preservation-before.json and preservation-after.json.', '',
  '| Path | Bytes | Review purpose |', '| --- | ---: | --- |',
  ...e.untrackedInventory.map(f=>`| ${f.path} | ${f.bytes} | ${f.path.endsWith('.json')?'Parsed complete evidence data ('+f.json.nodesRead+' nodes)':f.path.endsWith('.sql')?'Static SQL draft; not executed':/\.(?:mjs|ts)$/.test(f.path)?'Source/test/proof script inspected; SQL/business inventory runners not executed':'Review documentation read'} |`), '',
  'The existing outputs/phase-a-history-validation/read-engineering-evidence.mjs reads configured credentials and executes read-only SQL; it was not run. Existing validate-draft.mjs and outputs-invariance.test.ts execute synthetic SQL migrations and capture statements; they were not run. Original workbook-evidence and dependency JSON data remain unchanged.', '',
  'Review-created files are confined to outputs/phase-b-acceptance-review/. They are evidence and synthetic tests, not application features or migrations. The default application Vitest configuration excludes outputs/**; the explicit review config runs only the new acceptance probes.'];
fs.writeFileSync(path.join(dir,'untracked-work-inventory.md'),inv.join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({verification,columns:tables.map(t=>({table:t.name,columns:t.items.filter(i=>!/^(?:UNIQUE|FOREIGN KEY|CHECK|PRIMARY KEY)\b/.test(i)).length})),preservationUnchanged:summary.unchanged,protectedFiles:summary.protectedFileCount},null,2));
