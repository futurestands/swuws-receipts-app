import pkg from "pg"
const { Client } = pkg
import "dotenv/config"

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    const res = await client.query('SELECT name, email, role FROM "user"');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
