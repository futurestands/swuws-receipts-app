// Isolated regression harness for the actual server action; no network or production DB.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/actions/crm.ts'), 'utf8');
const start = source.indexOf('export async function processSmsBatch(');
const end = source.indexOf('export async function getCrmStats(', start);
const code = ts.transpileModule(source.slice(start, end).replace('export async function', 'async function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/sms-dispatch.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: helper.exports });

function harness(size, uncertain = false) {
  const rows = Array.from({ length: size }, (_, i) => ({ id: String(i), batchId: 'batch', customerId: null, phoneNumber: '+256770000001', message: 'Synthetic only', status: 'queued' }));
  const batch = { id: 'batch', status: 'approved', category: 'Alerts', name: 'Probe' };
  let calls = 0;
  const record = Object.fromEntries(['id', 'batchId', 'status', 'error', 'phoneNumber'].map(key => [key, key]));
  const batchTable = { id: 'id' };
  function matches(row, condition) {
    if (!condition) return true;
    if (condition.op === 'eq') return row[condition.column] === condition.value;
    if (condition.op === 'in') return condition.value.includes(row[condition.column]);
    return condition.values.filter(Boolean).every(item => matches(row, item));
  }
  const db = {
    select(fields) {
      let condition, limit = Infinity;
      const query = { from: () => query, where: value => { condition = value; return query; }, limit: value => { limit = value; return query; }, then: (yes, no) => Promise.resolve().then(() => {
        const selected = rows.filter(row => matches(row, condition));
        if (!fields) return selected.slice(0, limit).map(row => ({ ...row }));
        if ('count' in fields) return [{ count: selected.length }];
        if ('sent' in fields) return [{ sent: selected.filter(row => row.status === 'sent').length, failed: selected.filter(row => row.status === 'failed').length }];
        return [];
      }).then(yes, no) };
      return query;
    },
    update(table) { return { set: values => ({ where: condition => {
      const changed = table === batchTable ? [batch] : rows.filter(row => matches(row, condition));
      for (const row of changed) Object.assign(row, values);
      return { returning: async () => changed.map(row => ({ id: row.id })), then: (yes, no) => Promise.resolve().then(yes, no) };
    } }) }; },
  };
  const context = { db, crmSmsRecord: record, crmSmsBatch: batchTable, requireUser: async () => ({ id: 'auditor' }), canApproveSms: () => true,
    requireSmsBatchInScope: async () => ({ ...batch }), SMS_SEND_BUDGET: 40, SMS_SEND_CONCURRENCY: 8,
    BILL_REMINDER_CATEGORY: 'Bill Reminders', ALREADY_MESSAGED_ERROR: 'Already messaged this billing period',
    getActiveBillingPeriod: async () => null, wasContactedThisPeriod: () => false,
    sendSMS: async () => { calls++; if (uncertain) throw new Error('Unknown external outcome'); return { delivered: true, id: 'fake' }; },
    dispatchClaimedSms: helper.exports.dispatchClaimedSms,
    eq: (column, value) => ({ op: 'eq', column, value }), and: (...values) => ({ op: 'and', values }), inArray: (column, value) => ({ op: 'in', column, value }), sql: () => '', count: () => '',
    writeAudit: async () => {}, notifySenderOfUndeliveredSms: async () => {}, revalidatePath: () => {}, console };
  vm.createContext(context); vm.runInContext(code, context);
  return { run: () => context.processSmsBatch('batch'), rows, batch, calls: () => calls };
}
(async () => {
  const large = harness(81);
  assert.equal((await large.run()).remaining, 41); assert.equal(large.batch.status, 'approved');
  assert.equal((await large.run()).remaining, 1); assert.equal((await large.run()).remaining, 0);
  assert.equal(large.batch.status, 'completed'); assert.equal(large.calls(), 81);
  const concurrent = harness(1); await Promise.all([concurrent.run(), concurrent.run()]); assert.equal(concurrent.calls(), 1);
  const uncertain = harness(1, true); await uncertain.run(); assert.equal(uncertain.rows[0].status, 'unknown'); assert.equal(uncertain.batch.status, 'needs_review');
  await assert.rejects(uncertain.run()); assert.equal(uncertain.calls(), 1);
  console.log('PASS: actual sender resumes over its budget, claims once under overlap, and holds uncertain delivery without resending');
})().catch(error => { console.error(error); process.exitCode = 1; });
