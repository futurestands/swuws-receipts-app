import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    const res = await client.query('SELECT name, "createdById" FROM crm_sms_batch');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
