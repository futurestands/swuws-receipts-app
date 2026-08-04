import pkg from "pg"
const { Client } = pkg
import "dotenv/config"

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    const tables = ['billing_run', 'billing_upload', 'customer', 'receipt', 'meter_reading', 'user', 'org_settings', 'billing_period', 'branch', 'water_scheme', 'cluster'];
    for (const table of tables) {
        try {
            const res = await client.query(`SELECT count(*) FROM "${table}"`);
            console.log(`${table}: ${res.rows[0].count}`);
        } catch (e) {
            console.log(`${table}: Table missing or error: ${e.message}`);
        }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
