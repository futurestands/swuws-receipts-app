import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- DB ENUM CHECK ---");

    const res = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE 'receipt_%' OR t.typname LIKE 'reconciliation_%';
    `);

    if (res.rows.length === 0) {
      console.log("No matching enums found. Columns are likely plain TEXT.");
    } else {
      console.log("Found enums:");
      console.table(res.rows);
    }

    console.log("--- CHECK COMPLETE ---");

  } catch (err) {
    console.error("❌ DB Check Error:", err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
