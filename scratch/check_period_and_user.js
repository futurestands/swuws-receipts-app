/**
 * FORENSIC CHECK: Why is the dashboard showing "No Active Billing Period"?
 */

const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { billingPeriod, user, iamRole, iamRolePermission, iamPermission } = require('../lib/db/schema');
const { eq, or } = require('drizzle-orm');

async function run() {
  console.log("--- DASHBOARD ACCESS AUDIT ---");

  try {
    // 1. Check for Active Billing Periods
    const periods = await db.select().from(billingPeriod).where(or(
      eq(billingPeriod.status, 'active'),
      eq(billingPeriod.status, 'draft'),
      eq(billingPeriod.status, 'validated'),
      eq(billingPeriod.status, 'closed')
    ));

    console.log(`\n[1] Billing Periods in DB: ${periods.length}`);
    periods.forEach(p => console.log(`  - ${p.periodName}: Status=${p.status}`));

    // 2. Identify the user "Mugumya Nicholas"
    const [targetUser] = await db.select().from(user).where(eq(user.name, 'Mugumya Nicholas')).limit(1);
    if (!targetUser) {
      console.log("\n❌ User 'Mugumya Nicholas' not found.");
    } else {
      console.log(`\n[2] User Context: ${targetUser.name}`);
      console.log(`  - Role: ${targetUser.role}`);
      console.log(`  - Cluster: ${targetUser.clusterId}`);
      console.log(`  - Branch: ${targetUser.branchId}`);
      console.log(`  - Scheme: ${targetUser.schemeId}`);
      console.log(`  - IAM Role ID: ${targetUser.iamRoleId}`);

      // 3. Check IAM Role Level and Permissions
      if (targetUser.iamRoleId) {
        const [role] = await db.select().from(iamRole).where(eq(iamRole.id, targetUser.iamRoleId)).limit(1);
        console.log(`\n[3] IAM Role Details: ${role?.name}`);
        console.log(`  - Level: ${role?.level}`);

        const perms = await db.select({
          code: iamPermission.code,
          scope: iamRolePermission.scope
        })
        .from(iamRolePermission)
        .innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
        .where(eq(iamRolePermission.roleId, targetUser.iamRoleId));

        console.log(`  - Permissions (${perms.length}):`);
        perms.forEach(p => console.log(`    * ${p.code} (Scope: ${p.scope})`));
      }
    }

  } catch (err) {
    console.error("\n❌ Audit failed:", err.message);
  } finally {
    process.exit(0);
  }
}

run();
