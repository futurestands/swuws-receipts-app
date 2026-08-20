import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // Check crm_complaint table columns
    const res = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'crm_complaint'
    `);

    const columns = res.rows.map(r => r.column_name);
    console.log("Found columns in crm_complaint:", columns.join(", "));

    if (columns.includes('schemeId')) {
      console.log("✅ Evidence: schemeId column exists in crm_complaint.");
    } else {
      console.error("❌ Evidence: schemeId column is MISSING.");
    }

    // Check if notification exists for crm_complaint_assigned
    const notesRes = await client.query(`
      SELECT count(*) FROM notification WHERE type = 'crm_complaint_assigned'
    `);
    console.log(`ℹ️ Evidence: There are ${notesRes.rows[0].count} assignment notifications in the system.`);

  } catch (err) {
    console.error("Forensic Error:", err);
  } finally {
    await client.end();
  }
}

run();
