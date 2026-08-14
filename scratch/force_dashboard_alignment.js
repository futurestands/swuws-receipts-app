const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- FORCING DEEP DASHBOARD ALIGNMENT ---');

    // 1. Get the current active period
    const periodRes = await client.query("SELECT id FROM billing_period WHERE status = 'active' LIMIT 1");
    if (periodRes.rows.length === 0) {
        console.log("No active period found.");
        return;
    }
    const periodId = periodRes.rows[0].id;

    // 2. Synchronize EVERY bill in the active period with the customer's current balance
    // This is the 'Master Sync' that fixes the 'reducing collections' issue.
    const syncRes = await client.query(`
      UPDATE billing_record br
      SET "totalDue" = c."accountBalance", "updatedAt" = now()
      FROM customer c
      WHERE br."customerId" = c.id
      AND br."billingPeriodId" = $1
      AND br."totalDue" != c."accountBalance"
    `, [periodId]);

    console.log(`✅ SUCCESS: Synchronized ${syncRes.rowCount} bills to match live ledger balances.`);

    // 3. Final Total Check
    const totalRes = await client.query(`
      SELECT
        SUM(GREATEST(0, (coalesce(br.arrears, 0)::numeric + coalesce(br."billAmount", 0)::numeric) - coalesce(br."totalDue", 0)::numeric)) as total_recovery
      FROM billing_record br
      WHERE br."billingPeriodId" = $1
    `, [periodId]);

    console.log(`\nNew Verified Monthly Total (Recovery): USh ${totalRes.rows[0].total_recovery}`);

  } catch (err) {
    console.error('Forensic Alignment Error:', err);
  } finally {
    await client.end();
  }
})();
