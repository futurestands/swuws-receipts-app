import pkg from "pg"
const { Client } = pkg
import "dotenv/config"

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function runCheck() {
  try {
    await client.connect();
    console.log("--- SWUWS FORENSIC CHECK ---");
    console.log("Timestamp:", new Date().toISOString());

    // 1. Check for decimal support in columns
    console.log("\n[1] Column Type Validation:");
    const columnsToCheck = [
      { table: 'tariff_configuration', col: 'unitPrice' },
      { table: 'tariff_configuration', col: 'serviceFee' },
      { table: 'customer', col: 'accountBalance' },
      { table: 'meter_reading', col: 'billedAmount' },
      { table: 'receipt', col: 'amount' }
    ];
    for (const c of columnsToCheck) {
      const res = await client.query(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `, [c.table, c.col]);
      if (res.rows[0]) {
        console.log(`${c.table}.${c.col}: ${res.rows[0].data_type} (${res.rows[0].numeric_precision}, ${res.rows[0].numeric_scale})`);
      } else {
        console.log(`${c.table}.${c.col}: COLUMN MISSING!`);
      }
    }

    // 2. Data Integrity - Orphaned Customers
    console.log("\n[2] Data Integrity:");
    const orphans = await client.query(`SELECT count(*) FROM customer WHERE "waterSchemeId" IS NULL`);
    console.log(`Orphaned Customers (No Scheme): ${orphans.rows[0].count}`);

    const negativeBalances = await client.query(`SELECT count(*) FROM customer WHERE "accountBalance" < 0`);
    console.log(`Customers with Negative Balances (Credit): ${negativeBalances.rows[0].count}`);

    const duplicates = await client.query(`
      SELECT "customerAccount", count(*)
      FROM customer
      WHERE "customerAccount" IS NOT NULL
      GROUP BY "customerAccount"
      HAVING count(*) > 1
    `);
    console.log(`Duplicate Account Numbers Found: ${duplicates.rows.length}`);
    duplicates.rows.forEach(d => console.log(`- ${d.customerAccount} (x${d.count})`));

    // 3. User Audit
    console.log("\n[3] User Audit:");
    const userRoles = await client.query(`SELECT role, count(*) FROM "user" GROUP BY role`);
    userRoles.rows.forEach(r => console.log(`Role [${r.role}]: ${r.count}`));

    const usersWithoutIam = await client.query(`SELECT count(*) FROM "user" WHERE "iamRoleId" IS NULL`);
    console.log(`Users without IamRole assigned: ${usersWithoutIam.rows[0].count}`);

    // 4. Hierarchy Health
    console.log("\n[4] Hierarchy Health:");
    const schemeHealth = await client.query(`SELECT count(*) FROM water_scheme WHERE "branchId" IS NULL`);
    console.log(`Schemes without Parent Branch: ${schemeHealth.rows[0].count}`);

    // 5. Recent System State
    console.log("\n[5] Latest System Errors (from Audit):");
    const errors = await client.query(`SELECT details->>'error' as err, count(*) FROM audit_log WHERE details->>'error' IS NOT NULL GROUP BY err LIMIT 5`);
    if (errors.rows.length === 0) console.log("No logged errors in audit trails.");
    errors.rows.forEach(e => console.log(`- ${e.err} (${e.count} occurrences)`));

  } catch (err) {
    console.error("Forensic check failed:", err.message);
  } finally {
    await client.end();
  }
}

runCheck();
