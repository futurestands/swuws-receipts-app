/**
 * DEBUG: Why is Mugumya Nicholas seeing global data?
 */

const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { user, iamRole } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');
const { getEffectivePermissions } = require('../lib/iam/index');

async function run() {
  console.log("--- SCOPE DEBUG ---");

  try {
    const [targetUser] = await db.select().from(user).where(eq(user.name, 'Mugumya Nicholas')).limit(1);
    if (!targetUser) {
      console.log("❌ User not found.");
      return;
    }

    console.log(`User: ${targetUser.name}`);
    console.log(`IAM Role ID: ${targetUser.iamRoleId}`);

    if (targetUser.iamRoleId) {
      const perms = await getEffectivePermissions(targetUser.iamRoleId);
      console.log("\nEffective Permissions & Scopes:");
      perms.forEach(p => {
        console.log(`- ${p.code}: ${p.scope}`);
      });

      const customersView = perms.find(p => p.code === 'customers.view');
      console.log(`\n'customers.view' scope is: ${customersView?.scope}`);
    }

  } catch (err) {
    console.error("\n❌ Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
