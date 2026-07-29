const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const DATABASE_URL = envContent.match(/^DATABASE_URL=(.+)$/m)[1].trim();

console.log('--- FINAL RECOVERY VERIFICATION ---');

const url = new URL(DATABASE_URL);
const config = {
    host: url.hostname,
    port: url.port ? parseInt(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
};

console.log('Parsed Config:', {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    ssl: config.ssl
});
const pool = new Pool(config);

async function verify() {
    try {
        console.log('Step 1: Connecting...');
        const client = await pool.connect();
        console.log('SUCCESS: Connection established.');

        console.log('Step 2: Querying hasAdmin() logic...');
        const res = await client.query('SELECT id FROM "user" WHERE role = $1 LIMIT 1', ['admin']);
        console.log('SUCCESS: Admin check complete. Rows found:', res.rows.length);

        client.release();
        console.log('\n--- VERDICT: PASS ---');
    } catch (err) {
        console.error('\n--- VERDICT: FAIL ---');
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

verify();
