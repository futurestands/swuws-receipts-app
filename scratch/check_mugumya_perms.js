const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { iamRolePermission, iamPermission } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function run() {
  const perms = await db.select({ code: iamPermission.code }).from(iamRolePermission).innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id)).where(eq(iamRolePermission.roleId, '3ac5b062-ddca-4867-946c-bfd076e7b3e9'));
  console.log(perms.map(p => p.code));
  process.exit(0);
}

run();
