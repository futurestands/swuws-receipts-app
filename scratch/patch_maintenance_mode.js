const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- PATCHING DATABASE ---');
    await client.query('ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "maintenanceMode" boolean NOT NULL DEFAULT false;');
    console.log('✅ PASS: maintenanceMode column added successfully.');

    // Also perform the "System Alignment" (Task [4] from forensics)
    // Synchronize the totalDue snapshot in billing_record with the live customer balance
    console.log('\n--- ALIGNING BILLING SNAPSHOTS (ONE-TIME SYNC) ---');
    const syncRes = await client.query(`
      UPDATE billing_record br
      SET "totalDue" = c."accountBalance", "updatedAt" = now()
      FROM customer c
      WHERE br."customerId" = c.id
      AND br."billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
      AND br."totalDue" != c."accountBalance"
    `);
    console.log(`✅ PASS: Synchronized ${syncRes.rowCount} billing snapshots with live customer balances.`);

  } catch (err) {
    console.error('Patch Error:', err);
  } finally {
    await client.end();
  }
})();
