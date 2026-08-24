import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();

    const branchId = '0a10edf3-05c2-4856-aa14-bbf66d8b1e05'; // Isingiro Main

    // 1. Total Cumulative Debt for Isingiro
    const debtRes = await client.query(`
      SELECT SUM("accountBalance") as total
      FROM customer c
      JOIN water_scheme ws ON c."waterSchemeId" = ws.id
      WHERE ws."branchId" = $1 AND c."accountBalance" > 0
    `, [branchId]);
    console.log("Isingiro Total Debt:", debtRes.rows[0].total);

    // 2. Global Total Debt
    const globalDebtRes = await client.query(`
      SELECT SUM("accountBalance") as total
      FROM customer WHERE "accountBalance" > 0
    `);
    console.log("Global Total Debt:", globalDebtRes.rows[0].total);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
