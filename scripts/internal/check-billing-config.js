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
  const res = await client.query("SELECT tv.content FROM managed_template mt JOIN template_version tv ON mt.\"activeVersionId\" = tv.id WHERE mt.code = 'import.billing.monthly';");
  console.log("Current Monthly Billing Import Schema Mapping:");
  if (res.rows[0]) {
    console.log(JSON.stringify(JSON.parse(res.rows[0].content), null, 2));
  } else {
    console.log("No mapping found.");
  }
  await client.end();
}

run().catch(console.error);
