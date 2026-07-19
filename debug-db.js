const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// 1. Read DATABASE_URL from .env manually to avoid dependency on dotenv for this debug script
function getDatabaseUrl() {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (err) {
    console.error('Error reading .env file:', err.message);
    return null;
  }
}

const dbUrl = getDatabaseUrl();

if (!dbUrl) {
  console.error('FAILED: DATABASE_URL not found in .env');
  process.exit(1);
}

console.log('--- DB DEBUG START ---');
console.log('Target URL (masked):', dbUrl.replace(/:([^@]+)@/, ':****@'));

// 2. Create pg Client using the exact same configuration as lib/db/index.ts
// We avoid connectionString to prevent the SSL override bug
const url = new URL(dbUrl);
const client = new Client({
  host: url.hostname,
  port: url.port ? parseInt(url.port) : 5432,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1) || "postgres",
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

async function debug() {
  console.log('Status: Connecting...');
  try {
    // 3. Connect
    await client.connect();
    console.log('Status: Connected successfully.');

    // 4. Execute version check
    console.log('Status: Checking "user" table...');
    try {
        const res = await client.query('SELECT * FROM "user" LIMIT 1');
        console.log('SUCCESS: "user" table exists and is readable.');
    } catch (e) {
        console.error('FAILED: "user" table check failed:', e.message);
    }

  } catch (err) {
    // 6. Handle errors specifically
    console.error('--- ERROR DETECTED ---');
    console.error('Code:', err.code);
    console.error('Message:', err.message);

    if (err.message.includes('self-signed certificate')) {
        console.log('Diagnosis: SSL - Certificate verification failed (Expected if rejectUnauthorized is not set, but we set it to false).');
    } else if (err.message.includes('password authentication failed')) {
        console.log('Diagnosis: Authentication - Incorrect credentials or special character encoding issue.');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
        console.log('Diagnosis: Network - Host unreachable or port blocked.');
    } else if (err.message.includes('Connection terminated unexpectedly')) {
        console.log('Diagnosis: Pooling/Proxy - The pooler or firewall dropped the session (likely port 6543 vs 5432 or prepared statement issue).');
    } else {
        console.log('Diagnosis: PostgreSQL Configuration or unknown error.');
    }
  } finally {
    // 7. Close connection
    await client.end();
    console.log('--- DB DEBUG END ---');
  }
}

debug();
