import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- CURRENT COLLECTION AUDIT ---");

    // 1. Check all categories
    const res = await client.query(`
      SELECT
        SUM(CAST("billAmount" AS NUMERIC)) as total_billed,
        SUM(CAST("recoveryAmount" AS NUMERIC)) as current_recovered,
        SUM(CAST("arrearsRecovery" AS NUMERIC)) as arrears_recovered
      FROM billing_record
    `);

    const stats = res.rows[0];
    console.log("Entire Database Totals (Across all periods):");
    console.log(`- Total Billed: USh ${parseFloat(stats.total_billed).toLocaleString()}`);
    console.log(`- Current Collected: USh ${parseFloat(stats.current_recovered).toLocaleString()}`);
    console.log(`- Arrears Collected: USh ${parseFloat(stats.arrears_recovered).toLocaleString()}`);

    // 2. Check PSP only
    const pspRes = await client.query(`
      SELECT
        SUM(CAST(br."billAmount" AS NUMERIC)) as total_billed,
        SUM(CAST(br."recoveryAmount" AS NUMERIC)) as current_recovered,
        SUM(CAST(br."arrearsRecovery" AS NUMERIC)) as arrears_recovered
      FROM billing_record br
      JOIN customer c ON br."customerId" = c.id
      WHERE c.category = 'psp'
    `);

    const psp = pspRes.rows[0];
    console.log("\nPSP Category Only:");
    console.log(`- Total Billed: USh ${parseFloat(psp.total_billed || 0).toLocaleString()}`);
    console.log(`- Current Collected: USh ${parseFloat(psp.current_recovered || 0).toLocaleString()}`);

    console.log("--- AUDIT COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}
run();
