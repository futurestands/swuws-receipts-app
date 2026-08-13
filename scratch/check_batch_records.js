const pkg = require('pg');
const { Client } = pkg;
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    await client.connect();
    console.log('--- BATCH INVESTIGATION ---');

    // Find the latest import for kabuyanda.xlsx
    const res = await client.query('SELECT * FROM daily_collection_import WHERE filename = $1 ORDER BY "createdAt" DESC LIMIT 1', ['kabuyanda.xlsx']);

    if (res.rows.length === 0) {
      console.log('No import found for kabuyanda.xlsx');
      return;
    }

    const batch = res.rows[0];
    console.log('Batch ID:', batch.id);
    console.log('Filename:', batch.filename);
    console.log('Total Records (Metadata):', batch.totalRecords);
    console.log('Total Amount (Metadata):', batch.totalAmount);

    // Check for actual records in daily_collection_record
    const countRes = await client.query('SELECT COUNT(*) FROM daily_collection_record WHERE "batchId" = $1', [batch.id]);
    console.log('Actual collection records saved:', countRes.rows[0].count);

    // Check if any records exist with amount > 0
    const moneyCountRes = await client.query('SELECT COUNT(*) FROM daily_collection_record WHERE "batchId" = $1 AND amount > 0', [batch.id]);
    console.log('Records with payment detected (> USh 0):', moneyCountRes.rows[0].count);

    // Let's see some raw data from the customer table for Kabuyanda to understand their current balances
    // (Assuming MeterRef might help identify them)
    console.log('\n--- SAMPLE CUSTOMER BALANCES (KABUYANDA AREA) ---');
    const custRes = await client.query(`
      SELECT c."customerAccount", c."accountBalance", c."name"
      FROM customer c
      JOIN water_scheme s ON c."waterSchemeId" = s.id
      WHERE s.name ILIKE '%KABUYANDA%'
      LIMIT 10
    `);
    console.table(custRes.rows);

  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await client.end();
  }
})();
