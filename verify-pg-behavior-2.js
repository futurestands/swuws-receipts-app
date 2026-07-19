const { Client } = require('pg');
const { parse } = require('pg-connection-string');

const connectionString = 'postgresql://user:pass@localhost:5432/db?sslmode=require';
const sslConfig = { rejectUnauthorized: false };

const config = {
  connectionString,
  ssl: sslConfig
};

// This is roughly what pg does internally
const pgConnectionString = require('pg-connection-string');
const parsedConfig = pgConnectionString.parse(config.connectionString);
const mergedConfig = { ...parsedConfig, ...config };
if (config.ssl) {
  mergedConfig.ssl = config.ssl;
}

console.log('Merged Config SSL:', mergedConfig.ssl);

const client = new Client(config);
console.log('Client SSL config:', client.ssl);
// pg 8.x stores it in connectionParameters
console.log('Client connectionParameters.ssl:', client.connectionParameters.ssl);
