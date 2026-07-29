const { Client } = require('pg');

const connectionString = 'postgresql://user:pass@localhost:5432/db?sslmode=require';
const sslConfig = { rejectUnauthorized: false };

const client = new Client({
  connectionString,
  ssl: sslConfig
});

console.log('Client ssl:', client.ssl);
console.log('Client connectionParameters.ssl:', client.connectionParameters.ssl);

// Let's see what happens if we DON'T use connectionString but pass host etc.
const client2 = new Client({
  host: 'localhost',
  user: 'user',
  password: 'pass',
  database: 'db',
  ssl: sslConfig
});
console.log('Client2 ssl:', client2.ssl);
console.log('Client2 connectionParameters.ssl:', client2.connectionParameters.ssl);
