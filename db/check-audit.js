import pkg from "pg"
const { Client } = pkg
import "dotenv/config"

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    const res = await client.query(`SELECT * FROM "audit_log" ORDER BY "createdAt" DESC LIMIT 20`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
