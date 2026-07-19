const { Client } = require('pg');
const client = new Client({
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.bejfrelaexozkuqapaao',
    password: 'QWr:B:VW6k7VyEf',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(() => client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
    .then(res => {
        console.log('TABLES:', res.rows.map(r => r.table_name).sort());
        return client.query("SELECT * FROM \"user\"");
    })
    .then(res => {
        console.log('USER_COUNT:', res.rows.length);
        client.end();
    })
    .catch(e => {
        console.error(e);
        client.end();
    });
