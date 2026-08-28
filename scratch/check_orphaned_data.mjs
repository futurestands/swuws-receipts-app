import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- ORPHANED DATA INTEGRITY CHECK ---");

    // 1. Billing Records without a valid Billing Run
    const brOrphans = await client.query(`
      SELECT count(*) FROM billing_record
      WHERE "billingRunId" NOT IN (SELECT id FROM billing_run)
    `);
    console.log(`Orphaned Billing Records: ${brOrphans.rows[0].count}`);

    // 2. Daily Collection Records without a valid Import Batch
    const crOrphans = await client.query(`
      SELECT count(*) FROM daily_collection_record
      WHERE "batchId" NOT IN (SELECT id FROM daily_collection_import)
    `);
    console.log(`Orphaned Daily Collection Records: ${crOrphans.rows[0].count}`);

    // 3. Reconciliation Matches without a valid Receipt or Record
    const matchOrphans = await client.query(`
      SELECT count(*) FROM reconciliation_match
      WHERE "receiptId" NOT IN (SELECT id FROM receipt)
      OR "dailyCollectionRecordId" NOT IN (SELECT id FROM daily_collection_record)
    `);
    console.log(`Orphaned Recon Matches: ${matchOrphans.rows[0].count}`);

    // 4. Verification of Deletion Completeness
    // If you delete an import, the records should be gone due to CASCADE or manual delete.
    // Let's check for "Ghost" values in customer balances (Advanced check)
    // We'll look for customers whose balance doesn't match the sum of their bills minus payments.
    // (This is a complex check, but let's start with raw counts).

    console.log("--- CHECK COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
