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
      WITH RECURSIVE h AS (
        SELECT id, name, "parent_id" FROM iam_role WHERE id = $1
        UNION ALL
        SELECT r.id, r.name, r."parent_id" FROM iam_role r
        INNER JOIN h ON r.id = h."parent_id"
      )
      SELECT * FROM h
    `, [roleId]);

    console.log("Role Hierarchy:", res.rows);

    const permsRes = await client.query(`
      SELECT p.code, rp.scope, r.name as role_name
      FROM iam_role_permission rp
      JOIN iam_permission p ON rp."permission_id" = p.id
      JOIN iam_role r ON rp."role_id" = r.id
      WHERE rp."role_id" IN (SELECT id FROM (
        WITH RECURSIVE h AS (
          SELECT id, "parent_id" FROM iam_role WHERE id = $1
          UNION ALL
          SELECT r.id, r."parent_id" FROM iam_role r
          INNER JOIN h ON r.id = h."parent_id"
        )
        SELECT id FROM h
      ) x)
      AND p.code = 'dashboard.view'
    `, [roleId]);

    console.log("All Inherited Dashboard Grants:", permsRes.rows);

  } catch (err) { console.error(err); } finally { await client.end(); }
}
run();
