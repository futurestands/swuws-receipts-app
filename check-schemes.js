const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  });
}

async function run() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT id, name FROM water_scheme;");
  console.log("Found " + res.rows.length + " schemes:");
  res.rows.forEach(r => console.log(`- ${r.name} (${r.id})`));
  await client.end();
}

run().catch(console.error);
