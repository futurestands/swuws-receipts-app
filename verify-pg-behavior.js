const { Pool, Client } = require('pg');

const connectionString = 'postgresql://user:pass@localhost:5432/db?sslmode=require';
const sslConfig = { rejectUnauthorized: false };

console.log('--- Pool Test ---');
const pool = new Pool({
  connectionString,
  ssl: sslConfig
});
console.log('Pool options.ssl:', pool.options.ssl);

console.log('\n--- Client Test ---');
const client = new Client({
  connectionString,
  ssl: sslConfig
});
// Internal property where pg store connection parameters after parsing
console.log('Client connection parameters ssl:', client.connectionParameters.ssl);
