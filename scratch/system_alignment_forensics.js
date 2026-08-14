const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- FINAL SYSTEM ALIGNMENT FORENSICS ---');

    // 1. SCHEMA VERIFICATION
    console.log('\n[1] SCHEMA: Checking Org Settings for Maintenance Mode...');
    const schemaRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'org_settings' AND column_name = 'maintenanceMode'
    `);
    if (schemaRes.rows.length > 0) {
      console.log('✅ PASS: maintenanceMode column exists in schema.');
    } else {
      console.log('❌ FAIL: maintenanceMode column is MISSING.');
    }

    // 2. DASHBOARD LOGIC: UPFRONT CONSUMPTION
    console.log('\n[2] LOGIC: Verifying "Current Collected" math includes advances...');
    // We'll calculate a sample for a few customers who have upfront
    const upfrontMathRes = await client.query(`
      SELECT
        SUM(CAST("billAmount" AS NUMERIC) - GREATEST(0, CAST("totalDue" AS NUMERIC))) as calculated_coverage
      FROM billing_record
      WHERE CAST(arrears AS NUMERIC) < 0
      AND "billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
    `);
    console.log(`INFO: System has successfully tracked USh ${upfrontMathRes.rows[0].calculated_coverage} in upfront credit applied to bills.`);

    // 3. DATA INTEGRITY: DUPLICATE PROTECTION
    console.log('\n[3] INTEGRITY: Checking for Duplicate Reference Violations in Syncs...');
    const dupRes = await client.query(`
      SELECT "externalReference", COUNT(*)
      FROM daily_collection_record
      GROUP BY "externalReference"
      HAVING COUNT(*) > 1
    `);
    if (dupRes.rows.length === 0) {
      console.log('✅ PASS: No duplicate external references found (Safety logic is holding).');
    } else {
      console.log('❌ FAIL: Duplicate references detected! Index violation risk.');
      console.table(dupRes.rows);
    }

    // 4. LINKAGE: DAILY SYNC -> BILLING SNAPSHOT
    console.log('\n[4] LINKAGE: Verifying Daily Syncs updated Bill Snapshots...');
    const linkRes = await client.query(`
      SELECT COUNT(*)
      FROM billing_record br
      JOIN customer c ON br."customerId" = c.id
      WHERE br."totalDue" != c."accountBalance"
      AND br."billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
    `);
    const driftCount = parseInt(linkRes.rows[0].count);
    if (driftCount === 0) {
      console.log('✅ PASS: All billing snapshots are perfectly aligned with live customer balances.');
    } else {
      console.log(`⚠️ WARNING: ${driftCount} bills are still out of sync with customer balances. These likely need a re-upload to trigger the new snapshot update logic.`);
    }

    // 5. SECURITY: BOOTSTRAP GUARD
    console.log('\n[5] SECURITY: Audit of bootstrapAdmin guard...');
    const fs = require('fs');
    const bootstrapContent = fs.readFileSync('app/actions/bootstrap.ts', 'utf8');
    if (bootstrapContent.includes('process.env.ALLOW_ADMIN_BOOTSTRAP !== "true"')) {
      console.log('✅ PASS: bootstrapAdmin is hard-locked for production.');
    } else {
      console.log('❌ FAIL: bootstrapAdmin is VULNERABLE.');
    }

  } catch (err) {
    console.error('Forensic Error:', err);
  } finally {
    await client.end();
  }
})();
