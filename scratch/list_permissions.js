const { db } = require('../lib/db/index');
const { iamPermission } = require('../lib/db/schema');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  const perms = await db.select().from(iamPermission);
  console.log(JSON.stringify(perms, null, 2));
  process.exit(0);
}

run();
