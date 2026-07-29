const { Client } = require("pg");
const url = new URL(process.argv[2]);

const config = {
  host: url.hostname,
  port: parseInt(url.port || "5432", 10),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1) || "postgres",
  ssl: { rejectUnauthorized: false }
};

console.log("Connecting with config:", { ...config, password: "***" });

const client = new Client(config);
client.connect()
  .then(() => {
    console.log("SUCCESS");
    return client.query("SELECT 1");
  })
  .then(res => console.log("RESULT:", res.rows))
  .catch(err => console.error("FAILED:", err.message))
  .finally(() => client.end());
