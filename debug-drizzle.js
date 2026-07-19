const { db } = require('./lib/db/index.ts');
const { user } = require('./lib/db/schema.ts');
const { eq } = require('drizzle-orm');

async function test() {
  console.log("Starting drizzle test...");
  try {
    const result = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1);
    console.log("Success! Result:", result);
  } catch (err) {
    console.error("Drizzle test failed:", err);
  } finally {
    process.exit();
  }
}

test();
