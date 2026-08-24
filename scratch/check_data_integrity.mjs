import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();

    // 1. Customers without water schemes
    const orphanedCustomers = await client.query('SELECT count(*) FROM customer WHERE "waterSchemeId" IS NULL');
    console.log("Customers without water scheme:", orphanedCustomers.rows[0].count);

    // 2. Water schemes without branches
    const orphanedSchemes = await client.query('SELECT count(*) FROM water_scheme WHERE "branchId" IS NULL');
    console.log("Water schemes without branch:", orphanedSchemes.rows[0].count);

    // 3. Customers with schemes that have no branch
    const detachedCustomers = await client.query(`
      SELECT count(*)
      FROM customer c
      LEFT JOIN water_scheme ws ON c."waterSchemeId" = ws.id
      WHERE ws.id IS NOT NULL AND ws."branchId" IS NULL
    `);
    console.log("Customers in schemes without branch:", detachedCustomers.rows[0].count);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
