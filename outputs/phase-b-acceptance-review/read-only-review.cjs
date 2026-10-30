/* eslint-disable @typescript-eslint/no-require-imports */
// Review harness only. Reads local files and application calculators; never imports DB clients or executes SQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const XLSX = require('xlsx');
const ts = require('typescript');
const root = process.cwd();
const out = path.join(root, 'outputs/phase-b-acceptance-review');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const initial = readJson(path.join(out, 'preservation-before.json'));
const modules = new Map();
function loadTs(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  if (!filename.startsWith(root + path.sep) || /[\\/]lib[\\/]db([\\/]|\.)/.test(filename)) throw Error('Database module import prohibited');
  const localRequire = createRequire(filename);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; modules.set(filename, mod);
  const resolve = name => {
    if (name.startsWith('@/')) return loadTs(name.slice(2) + '.ts');
    if (name.startsWith('.')) return loadTs(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    return localRequire(name);
  };
  new Function('require', 'module', 'exports', compiled)(resolve, mod, mod.exports);
  return mod.exports;
}
const workbookPath = 'C:/Users/MJ/Downloads/global target (1).xlsx';
const bytes = fs.readFileSync(workbookPath);
const wb = XLSX.read(bytes, { type: 'buffer', cellFormula: true, cellNF: true, cellStyles: true, bookFiles: true });
const previous = readJson(path.join(root, 'outputs/engineering-basis-review/workbook-evidence.json'));
const sheets = [], differences = [];
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name], old = previous.sheets.find(s => s.name === name);
  const cells = Object.entries(sheet).filter(([a,c]) => !a.startsWith('!') && c.v !== undefined && c.v !== null && c.v !== '');
  const formulas = cells.filter(([,c]) => c.f);
  for (const [address, c] of cells) {
    const p = old?.cells[address];
    if (!p || p.value !== c.v || (p.formula ?? '').replace(/^=/, '') !== (c.f ?? '')) differences.push({ sheet: name, address, current: { value: c.v, formula: c.f }, previous: p });
  }
  for (const address of Object.keys(old?.cells ?? {})) if (!sheet[address] || sheet[address].v === undefined) differences.push({ sheet: name, address, missingNow: true });
  sheets.push({ name, range: sheet['!ref'] ?? null, nonemptyCells: cells.length, formulaCount: formulas.length,
    externalFormulas: formulas.filter(([,c]) => /\[\d+\]/.test(c.f)).map(([address,c]) => ({ address, formula: c.f, saved: c.v })),
    errorCells: cells.filter(([,c]) => c.t === 'e').map(([address,c]) => ({ address, error: c.w, saved: c.v })),
    dateFormattedCells: cells.filter(([,c]) => c.t === 'n' && XLSX.SSF.is_date(c.z ?? '')).map(([address,c]) => ({ address, value: c.v, format: c.z })) });
}
const reference = loadTs('lib/decision-support/excel-reference.ts').parseExcelReferenceDataset(workbookPath);
const comparisons = [];
for (const s of reference.schemes) {
  const model = s.targetModel;
  for (const [,key] of [['L','production'],['M','supplied'],['P','sold'],['Q','billing'],['S','demand']]) {
    const result = model[key], address = result.source.split('!')[1], c = wb.Sheets['TARGETS GOLBAL'][address];
    comparisons.push({ area: s.areaName, scheme: s.schemeName, source: result.source, excelFormula: c?.f, savedValue: c?.v ?? null,
      localValue: result.value, state: result.state, unit: result.unit, dependencies: result.dependencies,
      absoluteDifference: result.value === null || c?.t !== 'n' ? null : Math.abs(result.value - c.v) });
  }
}
const sampleNames = ['Ryakarimira','Katuna','Migyera','Banyara','Endiizi','Rushaga'];
const examples = reference.schemes.filter(s => sampleNames.includes(s.schemeName)).map(s => {
  const row = Number(s.targetModel.production.source.match(/L(\d+)$/)[1]);
  return { scheme: s.schemeName, area: s.areaName, row,
    originalCells: Object.fromEntries(['E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U'].map(c => [c+row, wb.Sheets['TARGETS GOLBAL'][c+row] ?? null])),
    localModel: s.targetModel };
});
const untracked = initial.files.filter(f => f.path.startsWith('outputs/') || ['lib/decision-support/display.ts','lib/decision-support/mps-tps.test.ts','lib/decision-support/mps-tps.ts','lib/decision-support/performance-engine.test.ts'].includes(f.path));
const inventory = untracked.map(f => {
  const text = fs.readFileSync(f.path, 'utf8');
  let json = null;
  if (f.path.endsWith('.json')) {
    const obj = JSON.parse(text.replace(/^\uFEFF/, ''));
    let nodes = 0; const visit = x => { nodes++; if (x && typeof x === 'object') for (const value of Object.values(x)) visit(value); }; visit(obj);
    json = { parsed: true, topLevelKeys: Object.keys(obj), nodesRead: nodes };
  }
  return { ...f, json, lines: text.split(/\r?\n/).length, scope: f.path.split('/').slice(0,2).join('/'),
    sqlExecutionMarkers: /\.(?:query|execute)\s*\(/.test(text), businessEnvironmentMarkers: /DATABASE_URL|dotenv/.test(text) };
});
const schema = fs.readFileSync(path.join(root,'outputs/phase-a-baseline-proposal/schema-draft.sql'),'utf8');
const ddl = { tables: [...schema.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)].map(m=>({name:m[1],definition:m[2]})),
  explicitIndexes: [...schema.matchAll(/CREATE (?:UNIQUE )?INDEX [^;]+;/g)].map(m=>m[0]),
  functions: [...schema.matchAll(/CREATE FUNCTION (\w+)\(/g)].map(m=>m[1]),
  triggers: [...schema.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([^;]+);/g)].map(m=>m[1]),
  checks: (schema.match(/\bCHECK\s*\(/g)??[]).length,
  foreignKeys: (schema.match(/\bREFERENCES\b/g)??[]).length,
  primaryKeys: (schema.match(/\bPRIMARY KEY\b/g)??[]).length,
  uniqueConstraints: (schema.match(/^\s*(?:"supersedesId" text UNIQUE|UNIQUE\()/gm)??[]).length };
const evidence = { workbookPath, sha256: hash(bytes), allSheetsRead: true, sheetCount: sheets.length, sheets,
  formulaCount: sheets.reduce((n,s)=>n+s.formulaCount,0), externalFormulaCount: sheets.reduce((n,s)=>n+s.externalFormulas.length,0),
  savedErrorCount: sheets.reduce((n,s)=>n+s.errorCells.length,0), previousEvidenceDifferences: differences,
  methodology: Object.fromEntries(Object.entries(wb.Sheets.METHODOLOGY).filter(([a,c])=>!a.startsWith('!') && c.v!==undefined).map(([a,c])=>[a,c.v])),
  utilisationLegend: Object.fromEntries(Object.entries(wb.Sheets['GLOBAL SUMMERY']).filter(([a])=>/^[DE](79|80|81|82|83)$/.test(a))),
  comparisons, examples, ddl, untrackedInventory: inventory };
fs.writeFileSync(path.join(out,'workbook-and-design-evidence.json'), JSON.stringify(evidence,null,2), {flag:'wx'});
console.log(JSON.stringify({ sheets: sheets.map(({name,nonemptyCells,formulaCount})=>({name,nonemptyCells,formulaCount})), formulaCount: evidence.formulaCount,
  externalFormulaCount: evidence.externalFormulaCount, savedErrorCount: evidence.savedErrorCount, previousEvidenceDifferenceCount: differences.length,
  compared: comparisons.filter(c=>c.localValue!==null).length, maxError: Math.max(...comparisons.map(c=>c.absoluteDifference??0)),
  unresolved: comparisons.filter(c=>c.localValue===null).length, ddl: {...ddl,tables:ddl.tables.map(t=>t.name),triggers:ddl.triggers.map(t=>t.split(/\s+/)[0])},
  originalUntrackedFilesRead: inventory.length, protectedFiles: initial.files.length, methodology: evidence.methodology },null,2));
