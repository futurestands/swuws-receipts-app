const pkg = require("pg");
const { Client } = pkg;
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log("--- LOGIC FORENSICS: DEEP AUDIT ---");

    // 1. Check for "Balance Drift"
    // Does the customer's live balance match their latest billing record's Total Due?
    // This is our system's core "Source of Truth" rule.
    console.log("\n[1] Check: Balance Drift (Mismatch between Customer Balance and Latest Bill)");
    const driftRes = await client.query(`
      SELECT
        c."customerAccount",
        c."accountBalance" as portal_balance,
        br."totalDue" as latest_bill_total,
        (CAST(c."accountBalance" AS NUMERIC) - CAST(br."totalDue" AS NUMERIC)) as variance
      FROM customer c
      INNER JOIN billing_record br ON c.id = br."customerId"
      WHERE br."billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
      AND ABS(CAST(c."accountBalance" AS NUMERIC) - CAST(br."totalDue" AS NUMERIC)) > 0.01
      LIMIT 10
    `);
    if (driftRes.rows.length === 0) {
      console.log("✅ PASS: All customer balances match their latest active billing records.");
    } else {
      console.log("❌ FAIL: Balance drift detected in " + driftRes.rows.length + " sample accounts.");
      console.table(driftRes.rows);
    }

    // 2. Check for "Negative Bill" Anomalies
    console.log("\n[2] Check: Negative Bill Anomalies");
    const negRes = await client.query(`
      SELECT COUNT(*) FROM billing_record WHERE CAST("billAmount" AS NUMERIC) < 0
    `);
    if (parseInt(negRes.rows[0].count) === 0) {
      console.log("✅ PASS: No negative bills found (Financial Integrity).");
    } else {
      console.log("❌ FAIL: " + negRes.rows[0].count + " records have negative bills. This breaks collection math.");
    }

    // 3. Check for "Receipt Allocation" Logic
    // If a receipt is issued, it should reduce the balance.
    // Let's check for receipts that haven't affected the customer balance.
    console.log("\n[3] Check: Unallocated Receipts (Portal receipts vs Customer Balance)");
    const receiptRes = await client.query(`
      SELECT r."receiptNumber", r."amount", c."accountBalance", r."createdAt"
      FROM receipt r
      JOIN customer c ON r."customerId" = c.id
      WHERE r."createdAt" > NOW() - INTERVAL '1 day'
      LIMIT 5
    `);
    console.log("INFO: Sample of recent receipts and current balances:");
    console.table(receiptRes.rows);

    // 4. Check for orphaned billing runs
    console.log("\n[4] Check: Orphaned Billing Runs");
    const orphanRes = await client.query(`
      SELECT id, "schemeId", "totalAmount" FROM billing_run
      WHERE id NOT IN (SELECT "billingRunId" FROM billing_record)
    `);
    if (orphanRes.rows.length === 0) {
      console.log("✅ PASS: No orphaned billing runs found.");
    } else {
      console.log("❌ WARNING: Orphaned runs found (exists in history but has no data):");
      console.table(orphanRes.rows);
    }

  } catch (err) {
    console.error("Forensic Error:", err);
  } finally {
    await client.end();
  }
})();
