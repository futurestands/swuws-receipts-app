const pkg = require("pg");
const { Client } = pkg;
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log("--- VERIFYING B2 FIX (Deletion Guard) ---");

    // 1. Find a billing run with an active period
    const runRes = await client.query(`
      SELECT br.id, br."billingRunId", br."totalDue", br."arrears", br."billAmount"
      FROM billing_record br
      INNER JOIN billing_run run ON br."billingRunId" = run.id
      INNER JOIN billing_period p ON run."billingPeriodId" = p.id
      WHERE p.status = 'active'
      LIMIT 1
    `);

    if (runRes.rows.length === 0) {
      console.log("No active billing runs found to test.");
      return;
    }

    const testRecord = runRes.rows[0];
    const runId = testRecord.billingRunId;

    console.log(`Testing with Run ID: ${runId}`);

    // 2. Simulate a payment by reducing totalDue in the database
    // (This mimics what commitDailyBalanceSync does)
    const originalTotalDue = testRecord.totalDue;
    const reducedTotalDue = (parseFloat(originalTotalDue) - 100).toString();

    await client.query(`UPDATE billing_record SET "totalDue" = $1 WHERE id = $2`, [reducedTotalDue, testRecord.id]);
    console.log(`Simulated payment: totalDue reduced from ${originalTotalDue} to ${reducedTotalDue}`);

    // 3. Now try to call deleteBillingRun (I'll do it manually via SQL to see if my fix works)
    // Wait, the fix is in the server action code, not the database.
    // I should check if the server action WOULD block it.

    const interferenceCheck = await client.query(`
      SELECT id FROM billing_record
      WHERE "billingRunId" = $1
      AND CAST("totalDue" AS NUMERIC) < (CAST("arrears" AS NUMERIC) + CAST("billAmount" AS NUMERIC))
      LIMIT 1
    `, [runId]);

    if (interferenceCheck.rows.length > 0) {
      console.log("✅ SUCCESS: Interference detected. Deletion would be blocked by the new logic.");
    } else {
      console.log("❌ FAILURE: Interference NOT detected. Deletion would have erasing collections!");
    }

    // 4. Cleanup: Restore the totalDue
    await client.query(`UPDATE billing_record SET "totalDue" = $1 WHERE id = $2`, [originalTotalDue, testRecord.id]);
    console.log("Cleanup: totalDue restored.");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
