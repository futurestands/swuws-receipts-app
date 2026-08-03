import pkg from "pg"
const { Client } = pkg
import fs from "fs"
import path from "path"
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Node.js Migration Runner (Cross-Platform)
 */

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

async function runMigrations() {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  // Parse the connection string
  let clientConfig;
  try {
    const url = new URL(connectionString);

    clientConfig = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1) || "postgres",
      ssl: connectionString.includes("supabase.com")
        ? { rejectUnauthorized: false }
        : false,
    };
  } catch {
    clientConfig = {
      connectionString,
      ssl: connectionString.includes("supabase.com")
        ? { rejectUnauthorized: false }
        : false,
    };
  }

  const client = new Client(clientConfig);

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  try {
    await client.connect();
    console.log("Connected to database. Starting migrations...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (alreadyApplied.rows.length > 0) {
        console.log(`-- skipping ${file} (already applied)`);
        continue;
      }

      console.log(`-- applying ${file}`);

      const sql = fs.readFileSync(
        path.join(migrationsDir, file),
        "utf8"
      );

      try {
        await client.query("BEGIN");

        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );

        await client.query("COMMIT");

        console.log(`-- recorded ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");

        console.error(`FAILED: ${file}`);
        console.error(err.message);

        process.exit(1);
      }
    }

    console.log("All migrations applied successfully.");
  } catch (err) {
    console.error("Migration runner failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
