import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    const tables = ['user', 'branch', 'crm_complaint_category', 'water_scheme'];
    for (const t of tables) {
      const res = await client.query(`SELECT count(*) FROM "${t}"`);
      console.log(`Table ${t}: ${res.rows[0].count} rows`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
