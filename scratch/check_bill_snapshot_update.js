const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- BILL SNAPSHOT UPDATE CHECK ---');

    // 1. Get a customer who definitely had a reduction in the Isingiro sync
    // Based on the screenshot, 60000046448 had a +USh 28,230 reduction
    const accountNum = '60000046448';

    console.log(`Checking account: ${accountNum}`);

    const res = await client.query(`
      SELECT
        c."customerAccount",
        c."accountBalance" as current_balance,
        br."totalDue" as bill_snapshot_balance,
        br.arrears,
        br."billAmount",
        br."billingPeriodId"
      FROM customer c
      LEFT JOIN billing_record br ON c.id = br."customerId"
      WHERE c."customerAccount" = $1
      AND br."billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
    `, [accountNum]);

    if (res.rows.length === 0) {
      console.log("No billing record found for this customer in the active period.");
    } else {
      console.table(res.rows);
      const row = res.rows[0];
      if (row.current_balance === row.bill_snapshot_balance) {
        console.log("✅ SUCCESS: Bill snapshot matches live customer balance.");
      } else {
        console.log("❌ FAILURE: Bill snapshot totalDue is OUT OF SYNC with live balance.");
        console.log(`Difference: ${Number(row.bill_snapshot_balance) - Number(row.current_balance)}`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
