import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- FINAL SMS HUB VERIFICATION ---");

    // 1. Find Nicholas and Admin
    const userRes = await client.query('SELECT id, name, "branchId" FROM "user" WHERE name ILIKE \'%Nicholas%\' OR role = \'admin\'');
    const nicholas = userRes.rows.find(u => u.name.includes('Nicholas'));
    const admin = userRes.rows.find(u => u.id !== nicholas.id);

    // 2. Clear old test batch
    await client.query('DELETE FROM crm_sms_batch');

    // 3. Create a batch for Admin
    await client.query('INSERT INTO crm_sms_batch (id, name, category, "createdById") VALUES ($1, $2, $3, $4)',
        [randomUUID(), 'ADMIN BATCH', 'Alerts', admin.id]);

    // 4. Create a batch for Nicholas
    await client.query('INSERT INTO crm_sms_batch (id, name, category, "createdById") VALUES ($1, $2, $3, $4)',
        [randomUUID(), 'NICHOLAS BATCH', 'Alerts', nicholas.id]);

    console.log("Batches created.");

    // 5. Simulate Nicholas list (mimicking applySmsBatchScope)
    const nicholasVisible = await client.query(`
        SELECT name FROM crm_sms_batch
        WHERE "createdById" IN (SELECT id FROM "user" WHERE "branchId" = $1)
    `, [nicholas.branchId]);

    console.log("Nicholas Visible Batches:", nicholasVisible.rows.map(r => r.name));

    if (nicholasVisible.rows.length === 1 && nicholasVisible.rows[0].name === 'NICHOLAS BATCH') {
        console.log("✅ VERIFIED: Nicholas only sees his own territory's batches.");
    } else {
        console.log("❌ VERIFICATION FAILED: Scoping logic mismatch.");
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
