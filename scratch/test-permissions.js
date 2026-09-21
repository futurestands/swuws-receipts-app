import pkg from "pg"
const { Client } = pkg
import "dotenv/config"

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function runDiagnostic() {
  try {
    await client.connect();
    console.log("--- SWUWS USER PERMISSION AUDIT ---");

    // Look up the current administrator account details
    const res = await client.query(`
      SELECT id, name, email, role, "iamRoleId", active
      FROM "user"
      WHERE email = 'swuws421@gmail.com'
    `);

    const userRow = res.rows[0];
    if (!userRow) {
      console.log("❌ ERROR: User row swuws421@gmail.com not found in this database!");
      return;
    }

    console.log("\n[User Row Content]:");
    console.log(`- ID: ${userRow.id}`);
    console.log(`- Name: ${userRow.name}`);
    console.log(`- Email: ${userRow.email}`);
    console.log(`- Role (Raw DB Value): "${userRow.role}"`);
    console.log(`- IAM Role ID Link: ${userRow.iamRoleId}`);
    console.log(`- Active Status: ${userRow.active}`);

    // If an IAM Role ID exists, check its code and computed level
    if (userRow.iamRoleId) {
      const iamRes = await client.query(`
        SELECT id, name, code, level
        FROM iam_role
        WHERE id = $1
      `, [userRow.iamRoleId]);

      const roleRow = iamRes.rows[0];
      if (roleRow) {
        console.log("\n[Linked IAM Role Details]:");
        console.log(`- Role Code: "${roleRow.code}"`);
        console.log(`- Role Name: "${roleRow.name}"`);
        console.log(`- Role Level: ${roleRow.level}`);
      } else {
        console.log("\n❌ WARNING: The iamRoleId points to a row that DOES NOT EXIST in the iam_role table!");
      }
    } else {
      console.log("\nℹ️ NOTE: iamRoleId is NULL. The app will fall back to legacy string checks or level 0.");
    }

  } catch (err) {
    console.error("Diagnostic execution error:", err.message);
  } finally {
    await client.end();
  }
}

runDiagnostic();
