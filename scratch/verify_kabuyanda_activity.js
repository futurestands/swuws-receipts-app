const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- KABUYANDA DEEP DIVE ---');

    // 1. Find the schemes
    const schemeRes = await client.query("SELECT id, name FROM water_scheme WHERE name ILIKE '%KABUYANDA%'");
    if (schemeRes.rows.length === 0) {
        console.log("No schemes found with name like 'KABUYANDA'.");
        // Broaden search
        const allSchemes = await client.query("SELECT name FROM water_scheme LIMIT 50");
        console.log("Existing schemes (sample):", allSchemes.rows.map(r => r.name).join(", "));
        await client.end();
        return;
    }
    const schemes = schemeRes.rows;
    console.log("Target Schemes:", schemes.map(s => s.name).join(", "));
    const ids = schemes.map(s => s.id);

    // 2. Check recent billing runs (Monthly)
    console.log("\n--- RECENT MONTHLY IMPORTS (KABUYANDA) ---");
    const runRes = await client.query(`
      SELECT r.id, r."uploadedAt", r."totalAmount", r."totalCustomers", p."periodName"
      FROM billing_run r
      JOIN billing_period p ON r."billingPeriodId" = p.id
      WHERE r."schemeId" = ANY($1)
      ORDER BY r."uploadedAt" DESC LIMIT 5
    `, [ids]);
    console.table(runRes.rows);

    // 3. Check customer balance distribution
    console.log("\n--- CUSTOMER BALANCE SUMMARY (KABUYANDA) ---");
    const balRes = await client.query(`
      SELECT
        COUNT(*) as total_customers,
        SUM(CASE WHEN CAST("accountBalance" AS NUMERIC) > 0 THEN 1 ELSE 0 END) as with_debt,
        SUM(CASE WHEN CAST("accountBalance" AS NUMERIC) < 0 THEN 1 ELSE 0 END) as with_upfront,
        SUM(CASE WHEN CAST("accountBalance" AS NUMERIC) = 0 THEN 1 ELSE 0 END) as zero_balance,
        SUM(CAST("accountBalance" AS NUMERIC)) as total_balance
      FROM customer
      WHERE "waterSchemeId" = ANY($1)
    `, [ids]);
    console.table(balRes.rows);

    // 4. Check for any receipts issued in the last 48 hours for these schemes
    console.log("\n--- RECEIPTS ISSUED (LAST 48H - KABUYANDA) ---");
    const receiptRes = await client.query(`
      SELECT r."receiptNumber", r."customerName", r."amount", r."paymentDate", r."agentName"
      FROM receipt r
      WHERE r."schemeId" = ANY($1)
      AND r."paymentDate" > NOW() - INTERVAL '2 days'
      ORDER BY r."paymentDate" DESC
    `, [ids]);
    if (receiptRes.rows.length === 0) {
        console.log("No receipts found in the last 48 hours for Kabuyanda.");
    } else {
        console.table(receiptRes.rows);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
