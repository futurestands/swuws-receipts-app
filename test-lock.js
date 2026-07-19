const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const DATABASE_URL = envContent.match(/^DATABASE_URL=(.+)$/m)[1].trim();

const url = new URL(DATABASE_URL);
const client = new Client({
    host: url.hostname,
    port: url.port ? parseInt(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log('Connecting to', config.host, 'on port', config.port);
    await client.connect();
    console.log('Connected.');
    try {
        console.log('Attempting advisory lock...');
        await client.query('SELECT pg_advisory_xact_lock(727001)');
        console.log('SUCCESS: Advisory lock acquired.');
    } catch (e) {
        console.error('FAILED:', e.message);
    } finally {
        await client.end();
    }
}

const config = {
    host: url.hostname,
    port: url.port
};

run().catch(console.error);
