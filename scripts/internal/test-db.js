const { Pool } = require('pg');
const url = "postgresql://postgres.vnzpyimnzypbomkmdwcp:%2Fsupa%40123%21@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

console.log("Testing pooler connection string (eu-west-1)...");
const pool = new Pool({ connectionString: url });

pool.connect((err, client, release) => {
  if (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  }
  console.log("Connected successfully!");
  client.query('SELECT NOW()', (err, res) => {
    release();
    if (err) {
      console.error("Query error:", err.message);
      process.exit(1);
    }
    console.log("Query result:", res.rows[0]);
    pool.end();
  });
});
