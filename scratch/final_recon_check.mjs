import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- FINAL BATCH RECONCILIATION CHECK ---");

    // 1. Show all batches currently in the system
    const batches = await client.query(`
      SELECT id, filename, "totalAmount", "businessDate", "createdAt"
      FROM daily_collection_import
      ORDER BY "createdAt" DESC
    `);
    console.log("\nBatches physically in Database:");
    console.table(batches.rows);

    // 2. Check how many records are in the system total
    const records = await client.query('SELECT count(*), SUM(amount) as total FROM daily_collection_record');
    console.log(`\nTotal Records in system: ${records.rows[0].count}`);
    console.log(`Total Amount in system: USh ${parseFloat(records.rows[0].total || 0).toLocaleString()}`);

    // 3. Check for specific customer accounts to see if balances were restored
    // (We'll check the account from the previous error screenshot: 60000107578)
    const cust = await client.query('SELECT name, "customerAccount", "accountBalance" FROM customer WHERE "customerAccount" = $1', ['60000107578']);
    if (cust.rows.length > 0) {
        console.log(`\nSample Customer (60000107578) Current Balance: ${cust.rows[0].accountBalance}`);
    }

    console.log("\n--- CHECK COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
