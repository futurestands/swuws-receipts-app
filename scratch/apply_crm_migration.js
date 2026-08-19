import pkg from "pg"
const { Client } = pkg
import fs from "fs"
import path from "path"
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;

    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

async function run() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  const clientConfig = {
    connectionString,
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : false,
  };

  const client = new Client(clientConfig);
  try {
    await client.connect();
    console.log("Connected. Applying 0048_crm_module.sql...");

    const sqlPath = path.join(__dirname, "..", "db", "migrations", "0048_crm_module.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await client.query("BEGIN");
    await client.query(sql);

    // Also record it in schema_migrations so the regular runner skips it later
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      ["0048_crm_module.sql"]
    );

    await client.query("COMMIT");
    console.log("Success! CRM tables created.");
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
