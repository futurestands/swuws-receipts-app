const { Client } = require("pg");

const config = {
  host: "aws-0-eu-west-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.bejfrelaexozkuqapaao",
  password: "QWr:B:VW6k7VyEf",
  database: "postgres",
  ssl: { rejectUnauthorized: false }
};

console.log("Connecting with hardcoded password (special chars included)...");

const client = new Client(config);
client.connect()
  .then(() => {
    console.log("SUCCESS");
    return client.query("SELECT 1");
  })
  .then(res => console.log("RESULT:", res.rows))
  .catch(err => console.error("FAILED:", err.message))
  .finally(() => client.end());
