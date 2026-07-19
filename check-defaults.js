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
    await client.connect();
    const res = await client.query(`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user'
    `);
    console.log('USER COLUMNS:', res.rows);
    await client.end();
}

run().catch(console.error);
