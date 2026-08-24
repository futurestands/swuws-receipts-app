import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();

    // 1. Find Nicholas
    const userRes = await client.query('SELECT id, name, role, "iamRoleId", "branchId", "clusterId", "schemeId" FROM "user" WHERE name ILIKE $1', ['%Nicholas%']);
    if (userRes.rows.length === 0) {
      console.log("Nicholas not found");
      return;
    }
    const nicholas = userRes.rows[0];
    console.log("User Profile:", nicholas);

    if (nicholas.branchId) {
      const branchRes = await client.query('SELECT name FROM branch WHERE id = $1', [nicholas.branchId]);
      console.log("Assigned Branch:", branchRes.rows[0]?.name);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
