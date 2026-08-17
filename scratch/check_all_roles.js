const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { iamRole } = require('../lib/db/schema');

async function run() {
  const roles = await db.select().from(iamRole);
  console.log("Registered Roles:");
  roles.forEach(r => console.log(`- ${r.name} (Code: ${r.code}, Level: ${r.level})`));
  process.exit(0);
}

run();
