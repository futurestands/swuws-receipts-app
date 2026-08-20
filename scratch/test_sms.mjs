import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- CRM SMS TEST ---");

    const batchId = 'test-sms-batch-' + Date.now();
    const smsId = 'test-sms-rec-' + Date.now();
    const phone = '0700123456';
    const message = 'Your complaint COMP-TEST-712 has been received and assigned to Hillary.';

    // 1. Create SMS Batch
    await client.query(`
      INSERT INTO crm_sms_batch (id, name, category, status, "totalMessages", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [batchId, 'Test Batch', 'Alerts', 'pending', 1]);

    // 2. Queue Individual SMS
    await client.query(`
      INSERT INTO crm_sms_record (id, "batchId", "phoneNumber", message, status, "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [smsId, batchId, phone, message, 'queued']);

    const checkSms = await client.query('SELECT * FROM crm_sms_record WHERE id = $1', [smsId]);
    if (checkSms.rows.length > 0) {
      console.log(`✅ Evidence: SMS queued for phone ${phone}.`);
      console.log(`ℹ️ Message: "${checkSms.rows[0].message}"`);
    }

    console.log("--- SMS TEST COMPLETE ---");

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
