/**
 * IAM FORENSICS V2: Checking Area Engineer Permissions
 */

const { db } = require('../lib/db/index');
const { iamRole, iamRolePermission, iamPermission } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');
const dotenv = require('dotenv');
dotenv.config();

async function runAudit() {
  console.log("--- IAM PERMISSION AUDIT ---");

  try {
    const roles = await db.select().from(iamRole);
    const areaEngineer = roles.find(r => r.name.toLowerCase().includes('area engineer'));

    if (!areaEngineer) {
      console.log("❌ Area Engineer role not found.");
      return;
    }

    console.log(`Role Found: ${areaEngineer.name} (ID: ${areaEngineer.id}, Level: ${areaEngineer.level})`);

    const perms = await db.select({
      code: iamPermission.code,
      scope: iamRolePermission.scope
    })
    .from(iamRolePermission)
    .innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
    .where(eq(iamRolePermission.roleId, areaEngineer.id));

    console.log("\nAssigned Permissions:");
    if (perms.length === 0) {
      console.log("- No permissions assigned.");
    } else {
      perms.forEach(p => console.log(`- ${p.code} (Scope: ${p.scope})`));
    }

    // Check specifically for permissions that open the Admin console
    const adminOpeningCodes = ["users.view", "reports.view", "roles.view", "branding.manage", "system.audit.view"];
    const foundAdminCodes = perms.filter(p => adminOpeningCodes.includes(p.code));

    if (foundAdminCodes.length > 0) {
      console.log("\n⚠️ SECURITY ALERT: This role has permissions that grant access to the Admin Console:");
      foundAdminCodes.forEach(p => console.log(`  - ${p.code} is assigned.`));
      console.log("\nACTION: Remove these permissions from the 'Area Engineer' role to block Admin access.");
    } else {
      console.log("\n✅ This role does NOT have permissions that grant access to the Admin Console.");
    }

  } catch (err) {
    console.error("Audit failed:", err.message);
  } finally {
    process.exit(0);
  }
}

runAudit();
