import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- DOUBLE COUNTING INVESTIGATION ---");

    // 1. Check Daily Collection Batches
    const batchesRes = await client.query(`
      SELECT id, filename, "totalAmount", "businessDate", "createdAt"
      FROM daily_collection_import
      ORDER BY "createdAt" DESC
    `);
    console.log("Uploaded Batches:");
    console.table(batchesRes.rows);

    // 2. Check overlap between Daily Collections and Balance Syncs
    const syncRes = await client.query(`
      SELECT count(*), SUM(amount) as total
      FROM daily_collection_record
      WHERE "externalReference" LIKE 'SYNC-%'
    `);
    console.log(`\nBalance Sync Cash (Automated): USh ${parseFloat(syncRes.rows[0].total || 0).toLocaleString()}`);

    // 3. Check Manual/Standard Daily Collections
    const manualRes = await client.query(`
      SELECT count(*), SUM(amount) as total
      FROM daily_collection_record
      WHERE "externalReference" NOT LIKE 'SYNC-%'
    `);
    console.log(`Standard Daily Cash (Uploaded): USh ${parseFloat(manualRes.rows[0].total || 0).toLocaleString()}`);

    console.log("\n--- INVESTIGATION COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
