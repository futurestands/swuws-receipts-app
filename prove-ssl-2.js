const { Pool } = require('pg');

// Simulate the race condition: process.env.DATABASE_URL is not set yet
// but will be set by the time the pool actually connects (e.g. by another module or internal pg logic)
delete process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // undefined
  ssl: process.env.DATABASE_URL?.includes("supabase.com") ? { rejectUnauthorized: false } : false, // false
});

// Now set it
process.env.DATABASE_URL = 'postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

console.log('Pool config SSL:', pool.options.ssl);

async function test() {
    try {
        // When connect() is called, pg looks at process.env if config was sparse
        await pool.connect();
    } catch (err) {
        console.log('Caught Error:', err.message);
        if (err.message.includes('self-signed certificate')) {
            console.log('\n--- PROOF ---');
            console.log('The error "SELF_SIGNED_CERT_IN_CHAIN" occurred because the Pool was initialized with "ssl: false"');
            console.log('due to process.env.DATABASE_URL being missing at construction time.');
            console.log('Later, the pg driver read DATABASE_URL from the environment, saw "sslmode=require",');
            console.log('and applied its own default SSL config (which rejects unauthorized certificates).');
        }
    } finally {
        await pool.end();
    }
}

test();
