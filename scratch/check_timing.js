const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- TIMING & INTEGRITY CHECK ---');

    // 1. When were the last Monthly Imports done?
    console.log("\n--- RECENT MONTHLY IMPORTS (ALL SCHEMES) ---");
    const runRes = await client.query(`
      SELECT s.name as scheme, r."uploadedAt", r."totalAmount", r."totalCustomers"
      FROM billing_run r
      JOIN water_scheme s ON r."schemeId" = s.id
      ORDER BY r."uploadedAt" DESC LIMIT 10
    `);
    console.table(runRes.rows);

    // 2. Check a few customers who were in the 0-recovery imports
    // Since we don't have the file, let's look at ISINGIRO T/C (likely kabuyanda match)
    console.log("\n--- ISINGIRO T/C CUSTOMER SAMPLE ---");
    const custRes = await client.query(`
      SELECT c."customerAccount", c."accountBalance", c."updatedAt", c.name
      FROM customer c
      JOIN water_scheme s ON c."waterSchemeId" = s.id
      WHERE s.name = 'ISINGIRO T/C'
      LIMIT 10
    `);
    console.table(custRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
