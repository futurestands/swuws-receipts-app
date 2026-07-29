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
  const res = await client.query("SELECT name, \"customerAccount\", \"openingArrears\", \"accountBalance\" FROM customer ORDER BY \"createdAt\" DESC LIMIT 10;");
  console.log("Last 10 imported customers:");
  res.rows.forEach(r => console.log(`- ${r.name} (${r.customerAccount}): Arrears: ${r.openingArrears}, Balance: ${r.accountBalance}`));

  const sumRes = await client.query("SELECT SUM(\"openingArrears\") as total FROM customer;");
  console.log("\nTotal Arrears in System: " + sumRes.rows[0].total);

  await client.end();
}

run().catch(console.error);
