const pkg = require("pg");
const { Client } = pkg;
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log("--- DRIFT DETAILS ---");

    const res = await client.query(`
      SELECT
        c."customerAccount",
        c."accountBalance",
        br."totalDue",
        br."billingPeriodId",
        p."periodName",
        p."status" as period_status
      FROM customer c
      LEFT JOIN billing_record br ON c.id = br."customerId"
      LEFT JOIN billing_period p ON br."billingPeriodId" = p.id
      WHERE c."customerAccount" IN ('60000196957', '60000102028')
    `);
    console.table(res.rows);

    const activePeriod = await client.query(`SELECT id, "periodName" FROM billing_period WHERE status = 'active'`);
    console.log("Active Period:", activePeriod.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
