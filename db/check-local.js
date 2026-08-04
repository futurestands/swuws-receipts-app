import pkg from "pg"
const { Client } = pkg

const localUrl = 'postgresql://postgres:SWsip%40123@localhost:5433/swuws_receipts';

const client = new Client({
  connectionString: localUrl,
});

(async () => {
  try {
    await client.connect();
    console.log("Connected to LOCAL database.");
    const tables = ['billing_run', 'customer', 'receipt', 'meter_reading', 'user', 'org_settings'];
    for (const table of tables) {
        try {
            const res = await client.query(`SELECT count(*) FROM "${table}"`);
            console.log(`${table}: ${res.rows[0].count}`);
        } catch (e) {
            console.log(`${table}: Table missing or error: ${e.message}`);
        }
    }
  } catch (err) {
    console.error("Failed to connect to local DB:", err.message);
  } finally {
    await client.end();
  }
})();
