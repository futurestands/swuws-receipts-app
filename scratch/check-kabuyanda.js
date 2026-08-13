const pkg = require("pg");
const { Client } = pkg;
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log("--- KABUYANDA SYNC INVESTIGATION ---");

    // 1. Get the specific batch for kabuyanda.xlsx
    const batchRes = await client.query(`
      SELECT id, filename, "totalAmount", "totalRecords", "createdAt"
      FROM daily_collection_import
      WHERE filename = 'kabuyanda.xlsx'
      ORDER BY "createdAt" DESC LIMIT 1
    `);

    if (batchRes.rows.length === 0) {
      console.log("Error: Batch not found in history.");
      process.exit(1);
    }

    const batch = batchRes.rows[0];
    console.log("File:", batch.filename);
    console.log("Records Processed:", batch.totalRecords);
    console.log("Total Amount Recorded:", batch.totalAmount);

    // 2. Check if any collection records were actually saved
    const recordCountRes = await client.query(`
      SELECT COUNT(*) FROM daily_collection_record WHERE "batchId" = $1
    `, [batch.id]);
    console.log("Collection Records Created (New Money):", recordCountRes.rows[0].count);

    // 3. Find if customer balances were updated
    // We'll look at the updatedAt timestamp for customers in this scheme
    const updateRes = await client.query(`
      SELECT COUNT(*) FROM customer
      WHERE "updatedAt" >= $1 - INTERVAL '10 minutes'
      AND "updatedAt" <= $1 + INTERVAL '1 minute'
    `, [batch.createdAt]);

    console.log("Customer Balances Updated during this import:", updateRes.rows[0].count);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
