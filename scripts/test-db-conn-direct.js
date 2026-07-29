const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false }
});
client.connect()
  .then(() => {
    console.log("SUCCESS");
    return client.query("SELECT 1");
  })
  .then(res => console.log("RESULT:", res.rows))
  .catch(err => console.error("FAILED:", err.message))
  .finally(() => client.end());
