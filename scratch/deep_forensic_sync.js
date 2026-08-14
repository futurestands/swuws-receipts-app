const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- DEEP DASHBOARD FORENSICS ---');

    // 1. Get the current active period
    const periodRes = await client.query("SELECT id, \"periodName\" FROM billing_period WHERE status = 'active' LIMIT 1");
    const activePeriod = periodRes.rows[0];
    console.log("Active Period:", activePeriod ? activePeriod.periodName : "NONE");
    const periodId = activePeriod ? activePeriod.id : null;

    // 2. Check Daily Collection Imports
    console.log("\n--- RECENT DAILY IMPORTS ---");
    const importsRes = await client.query(`
      SELECT id, filename, "totalAmount", "billingPeriodId", "status", "createdAt"
      FROM daily_collection_import
      ORDER BY "createdAt" DESC LIMIT 5
    `);
    console.table(importsRes.rows);

    // 3. Check Daily Collection Records status distribution
    console.log("\n--- RECORD STATUS DISTRIBUTION (LATEST BATCH) ---");
    if (importsRes.rows.length > 0) {
        const latestId = importsRes.rows[0].id;
        const statusRes = await client.query(`
          SELECT "importStatus", COUNT(*), SUM(amount) as total_money
          FROM daily_collection_record
          WHERE "batchId" = $1
          GROUP BY "importStatus"
        `, [latestId]);
        console.table(statusRes.rows);
    }

    // 4. Test the join used in reports.ts
    console.log("\n--- TESTING JOIN INTEGRITY ---");
    const joinRes = await client.query(`
      SELECT
        COUNT(r.id) as record_count,
        SUM(r.amount) as total_amount
      FROM daily_collection_record r
      INNER JOIN daily_collection_import i ON r."batchId" = i.id
      INNER JOIN customer c ON r."accountNumber" = c."customerAccount"
      WHERE r."importStatus" = 'matched'
      AND i."billingPeriodId" = $1
    `, [periodId]);
    console.table(joinRes.rows);

    // 5. Check if accountNumber casing/spaces is an issue
    console.log("\n--- DATA FORMAT CHECK (SAMPLES) ---");
    const sampleRes = await client.query(`
      SELECT
        r."accountNumber" as record_acc,
        c."customerAccount" as cust_acc
      FROM daily_collection_record r
      LEFT JOIN customer c ON r."accountNumber" = c."customerAccount"
      WHERE r."batchId" = $1
      LIMIT 5
    `, [importsRes.rows[0]?.id]);
    console.table(sampleRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
