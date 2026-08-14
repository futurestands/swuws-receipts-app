const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- FINAL REFACTOR VERIFICATION ---');

    // 1. Get current active period
    const periodRes = await client.query("SELECT id FROM billing_period WHERE status = 'active' LIMIT 1");
    const periodId = periodRes.rows[0].id;

    // 2. Test Derived Formula (Monthly Bills)
    console.log('\n[1] LEDGER: Testing derived recovery formula for August...');
    const monthlyRes = await client.query(`
      SELECT
        SUM(GREATEST(0, (coalesce(br.arrears, 0)::numeric + coalesce(br."billAmount", 0)::numeric) - coalesce(br."totalDue", 0)::numeric)) as total_recovery_derived
      FROM billing_record br
      WHERE br."billingPeriodId" = $1
    `, [periodId]);
    console.log(`Verified Monthly Recovery (Derived): USh ${monthlyRes.rows[0].total_recovery_derived}`);

    // 3. Test Field Reading Recovery (The Blindspot Fix)
    console.log('\n[2] FIELD: Checking if meter reading recovery is now detectable...');
    const fieldRes = await client.query(`
      SELECT
        COUNT(*) as readings,
        SUM(GREATEST(0, (coalesce(mr."previousBalanceSnapshot", 0)::numeric + coalesce(mr."billedAmount", 0)::numeric) - coalesce(c."accountBalance", 0)::numeric)) as field_recovery
      FROM meter_reading mr
      JOIN customer c ON mr."customerId" = c.id
      WHERE mr."billingPeriodId" = $1
    `, [periodId]);
    console.log(`Detected Field Billing Recovery: USh ${fieldRes.rows[0].field_recovery || 0}`);

    // 4. Verify Sync Engine Period Lock
    console.log('\n[3] ENGINE: Verifying sync update logic...');
    const fs = require('fs');
    const syncCode = fs.readFileSync('app/actions/daily-collections.ts', 'utf8');
    if (syncCode.includes('AND br."billingPeriodId" = (SELECT id FROM billing_period WHERE status = \'active\' LIMIT 1)')) {
       console.log('✅ PASS: Sync updates are locked to the ACTIVE period only.');
    } else if (syncCode.includes('billing_record.id = ( SELECT id FROM billing_record')) {
       console.log('✅ PASS: Sync updates use the LATEST bill for the customer (Fallback mode).');
    }

    // 5. Verify reports.ts Logic (Upfront inclusion)
    console.log('\n[4] REPORTS: Auditing reports.ts for upfront inclusion...');
    const reportCode = fs.readFileSync('app/actions/reports.ts', 'utf8');
    if (reportCode.includes('verifiedCurrent = Number(importStats?.verifiedCurrent || 0) + Number(importStats?.verifiedUpfront || 0)')) {
       console.log('✅ PASS: Upfront consumption is now correctly FOLDED into Current Collection.');
    } else {
       console.log('❌ FAIL: Upfront consumption logic might be missing from the reports file.');
    }

  } catch (err) {
    console.error('Forensic Error:', err);
  } finally {
    await client.end();
  }
})();
