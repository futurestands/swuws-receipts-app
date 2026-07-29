const { Pool } = require('pg');

const config = {
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.bejfrelaexozkuqapaao',
    password: 'QWr:B:VW6k7VyEf',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
};

console.log('Testing with props...');
const pool = new Pool(config);

pool.connect()
    .then(async client => {
        console.log('CONNECTED');
        const res = await client.query("SELECT schema_name FROM information_schema.schemata");
        console.log('QUERY SUCCESS:', res.rows.map(r => r.schema_name));
        client.release();
        pool.end();
    })
    .catch(err => {
        console.log('FAILED:', err.message);
        pool.end();
    });
