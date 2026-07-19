const { Pool } = require('pg');

async function test() {
    console.log('--- VERIFYING LIB/DB FIX ---');
    const config = {
        host: 'aws-0-eu-west-1.pooler.supabase.com',
        port: 5432,
        user: 'postgres.bejfrelaexozkuqapaao',
        password: 'QWr:B:VW6k7VyEf',
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    };

    const pool = new Pool(config);
    try {
        console.log('Connecting...');
        const client = await pool.connect();
        console.log('CONNECTED successfully.');

        console.log('Testing hasAdmin query...');
        const res = await client.query('SELECT id FROM "user" WHERE role = $1 LIMIT 1', ['admin']);
        console.log('QUERY SUCCESS. Admin exists:', res.rows.length > 0);

        client.release();
        console.log('VERDICT: PASS');
    } catch (err) {
        console.log('VERDICT: FAIL');
        console.log('Error:', err.message);
    } finally {
        await pool.end();
    }
}

test();
