const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' });

async function run() {
  await client.connect();
  const userId = 'Hln1JkRoQILDcff9PrhAdnScz3f9kFjJ';

  const userRes = await client.query('SELECT email FROM "user" WHERE id = $1', [userId]);
  const email = userRes.rows[0].email;
  console.log('EMAIL_HEX:', Buffer.from(email).toString('hex'));
  console.log('EMAIL_LITERAL:', JSON.stringify(email));

  await client.end();
}

run().catch(console.error);
