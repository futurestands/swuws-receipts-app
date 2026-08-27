import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    await client.query("DELETE FROM meter_reading WHERE \"customerId\" IN (SELECT id FROM customer WHERE \"customerAccount\" = 'TEST-INT-1')");
    await client.query("DELETE FROM customer WHERE \"customerAccount\" = 'TEST-INT-1'");
    console.log("Cleanup complete.");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
