import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    const roleId = '3ac5b062-ddca-4867-946c-bfd076e7b3e9'; // Area Engineer
    const res = await client.query(`
      SELECT p.code, rp.scope
      FROM iam_role_permission rp
      JOIN iam_permission p ON rp."permission_id" = p.id
      WHERE rp."role_id" = $1 AND p.code = 'dashboard.view'
    `, [roleId]);
    console.log("Dashboard View Grant:", res.rows[0]);
  } catch (err) { console.error(err); } finally { await client.end(); }
}
run();
