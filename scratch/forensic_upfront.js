const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- UPFRONT CONSUMPTION FORENSICS ---');

    // 1. Find customers who had an upfront (negative arrears) in their August bill
    const res = await client.query(`
      SELECT
        "accountNumber",
        arrears,
        "billAmount",
        "totalDue",
        "recoveryAmount"
      FROM billing_record
      WHERE CAST(arrears AS NUMERIC) < 0
      AND "billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
      LIMIT 10
    `);

    console.log("Samples of customers who started the month with UPFRONT:");
    console.table(res.rows);

    // 2. Calculate the "Hidden Collection" (Credit Consumed)
    const statsRes = await client.query(`
      SELECT
        SUM(CASE
          WHEN CAST(arrears AS NUMERIC) < 0 THEN
            CASE
              WHEN ABS(CAST(arrears AS NUMERIC)) >= CAST("billAmount" AS NUMERIC) THEN CAST("billAmount" AS NUMERIC)
              ELSE ABS(CAST(arrears AS NUMERIC))
            END
          ELSE 0
        END) as total_credit_consumed
      FROM billing_record
      WHERE "billingPeriodId" = (SELECT id FROM billing_period WHERE status = 'active' LIMIT 1)
    `);

    console.log("\nPotential increase to 'Current Collected' if we include consumed credit:");
    console.log(statsRes.rows[0].total_credit_consumed);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
