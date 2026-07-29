const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const DATABASE_URL = envContent.match(/^DATABASE_URL=(.+)$/m)[1].trim();

console.log('--- RECOVERY VERIFICATION 2 ---');

const cleanConnectionString = DATABASE_URL.replace(/[?&]sslmode=[^&]*/, "");
const sslConfig = DATABASE_URL.includes("supabase.com") ? { rejectUnauthorized: false } : false;

console.log('SSL Config:', JSON.stringify(sslConfig));

const pool = new Pool({
    connectionString: cleanConnectionString,
    ssl: sslConfig,
    connectionTimeoutMillis: 10000
});

async function verify() {
    try {
        console.log('Step 1: Connecting...');
        const client = await pool.connect();
        console.log('SUCCESS: Connection established.');

        console.log('Step 2: Querying version...');
        const resV = await client.query('SELECT version()');
        console.log('Version:', resV.rows[0].version);

        console.log('Step 3: Querying user table...');
        const res = await client.query('SELECT id FROM "user" WHERE role = $1 LIMIT 1', ['admin']);
        console.log('Admin found:', res.rows.length > 0);

        client.release();
        console.log('\n--- VERDICT: PASS ---');
    } catch (err) {
        console.error('\n--- VERDICT: FAIL ---');
        console.error('Error Name:', err.name);
        console.error('Error Message:', err.message);
        console.error('Error Stack:', err.stack);
    } finally {
        await pool.end();
    }
}

verify();
