const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

const DATABASE_URL = 'postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

// Proof 1: Show what pg-connection-string does with sslmode=require
const parsed = parse(DATABASE_URL);
console.log('Parsed SSL from URL:', parsed.ssl);

// Proof 2: Demonstrate the conflict in pg Pool constructor
// In pg, if connectionString is passed, it is parsed and then merged with other options.
// However, the internal logic for SSL merging in pg/pg-pool has changed over versions.

async function test() {
    console.log('\n--- Testing connection with current production config ---');
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes("supabase.com") ? { rejectUnauthorized: false } : false,
    });

    try {
        await pool.query('SELECT 1');
        console.log('Result: Success (unexpected if proving failure)');
    } catch (err) {
        console.log('Result: FAILED');
        console.log('Error Code:', err.code);
        console.log('Error Message:', err.message);

        if (err.message.includes('self-signed certificate')) {
            console.log('\nPROVED: rejectUnauthorized: false was ignored or overridden.');
        }
    } finally {
        await pool.end();
    }
}

test();
