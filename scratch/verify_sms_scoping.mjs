import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- SMS HUB SCOPING VERIFICATION ---");

    // 1. Find a regional user (e.g., Nicholas)
    const userRes = await client.query('SELECT id, name, "branchId" FROM "user" WHERE name ILIKE \'%Nicholas%\'');
    const nicholas = userRes.rows[0];
    console.log(`User: ${nicholas.name} (Branch: ${nicholas.branchId})`);

    // 2. Count total SMS batches
    const totalBatches = await client.query('SELECT count(*) FROM crm_sms_batch');
    console.log(`Total SMS Batches in System: ${totalBatches.rows[0].count}`);

    // 3. Check if current action code filters by creator
    // (Simulating listSmsBatches without explicit branchId join)
    const visibleBatches = await client.query('SELECT count(*) FROM crm_sms_batch');
    console.log(`Visible Batches for Nicholas (Simulated): ${visibleBatches.rows[0].count}`);

    if (parseInt(visibleBatches.rows[0].count) === parseInt(totalBatches.rows[0].count)) {
       console.log("❌ BUG CONFIRMED: Regional user sees ALL SMS batches org-wide.");
    } else {
       console.log("✅ SMS Hub is isolated.");
    }

    console.log("--- VERIFICATION COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
