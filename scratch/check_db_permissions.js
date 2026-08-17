/**
 * RAW DB CHECK: What are the scopes in the DB for Area Engineer?
 */

const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { iamRole, iamRolePermission, iamPermission } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function run() {
  console.log("--- RAW DB PERMISSION AUDIT ---");

  try {
    const roles = await db.select().from(iamRole).where(eq(iamRole.name, 'Area Engineer')).limit(1);
    const role = roles[0];

    if (!role) {
      console.log("❌ Role not found.");
      return;
    }

    const perms = await db.select({
      code: iamPermission.code,
      scope: iamRolePermission.scope
    })
    .from(iamRolePermission)
    .innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
    .where(eq(iamRolePermission.roleId, role.id));

    console.log(`Role: ${role.name}`);
    perms.forEach(p => console.log(`  - ${p.code}: ${p.scope}`));

  } catch (err) {
    console.error("\n❌ Error caught:", err);
  } finally {
    process.exit(0);
  }
}

run();
