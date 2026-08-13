const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- SEARCHING FOR KABUYANDA BY CUSTOMER COUNT (961) ---');

    // 1. Find schemes that have around 961 customers
    const countRes = await client.query(`
      SELECT s.name, s.id, COUNT(c.id) as customer_count
      FROM water_scheme s
      JOIN customer c ON s.id = c."waterSchemeId"
      GROUP BY s.name, s.id
      HAVING COUNT(c.id) BETWEEN 900 AND 1000
    `);

    console.log("Schemes with ~961 customers:");
    console.table(countRes.rows);

    // 2. Check recent imports globally to see what happened in the last 2 days
    console.log("\n--- GLOBAL RECENT DAILY IMPORTS ---");
    const dailyRes = await client.query(`
      SELECT filename, "totalRecords", "totalAmount", "createdAt"
      FROM daily_collection_import
      ORDER BY "createdAt" DESC LIMIT 10
    `);
    console.table(dailyRes.rows);

    // 3. Let's look for ANY payment reduction in the system in the last 2 days
    // Since receipts don't reduce balance anymore, we only care about EBS imports.
    // If 'totalAmount' in the import is > 0, it means recovery was recorded.

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
