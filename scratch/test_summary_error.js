/**
 * TEST: Why is getCollectionSummary failing for Mugumya Nicholas?
 */

const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { getCollectionSummary } = require('../app/actions/billing');
const { user } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

async function run() {
  console.log("--- TESTING COLLECTION SUMMARY ---");

  try {
    // 1. Get Mugumya Nicholas context
    const [targetUser] = await db.select().from(user).where(eq(user.name, 'Mugumya Nicholas')).limit(1);
    if (!targetUser) {
      console.log("❌ User not found.");
      return;
    }

    console.log(`User: ${targetUser.name} (ID: ${targetUser.id})`);

    // 2. Try to get summary (this is what DashboardPage does)
    // We need to mock the session or just call it directly
    // Since getCollectionSummary calls requireUser(), we might need to override it or mock it.

    // For forensic purposes, I'll just check if I can run the queries inside getCollectionSummary manually
    console.log("Executing getCollectionSummary simulation...");
    const summary = await getCollectionSummary();
    // Wait, getCollectionSummary uses requireUser() which gets the CURRENT session.
    // This script won't have a session.

    console.log("Summary:", JSON.stringify(summary, null, 2));

  } catch (err) {
    console.error("\n❌ Error caught:", err);
  } finally {
    process.exit(0);
  }
}

run();
