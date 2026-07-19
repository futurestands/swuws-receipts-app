const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    console.log("Connecting...");
    await client.connect();

    console.log("Connected!");

    const result = await client.query("SELECT version();");

    console.log(result.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();