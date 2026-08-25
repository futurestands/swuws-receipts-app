import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();

    console.log("Starting category normalization migration...");

    // 1. Normalize Customer Categories
    const custRes = await client.query(`
      UPDATE customer
      SET category = 'psp', "updatedAt" = now()
      WHERE category ILIKE 'public%' OR category = 'p'
      RETURNING id
    `);
    console.log(`Normalized ${custRes.rowCount} customers to 'psp'.`);

    // 2. Normalize Tariff Categories
    const tariffRes = await client.query(`
      UPDATE tariff_configuration
      SET "customerCategory" = 'psp', "updatedAt" = now()
      WHERE "customerCategory" ILIKE 'public%'
      RETURNING id
    `);
    console.log(`Normalized ${tariffRes.rowCount} tariff configurations to 'psp'.`);

    console.log("Migration complete.");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}
run();
