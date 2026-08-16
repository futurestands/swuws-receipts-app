/**
 * IAM FORENSICS: Investigating Role Assignment Errors
 *
 * Scenario: System Administrator (Global Access) cannot assign specific roles.
 */

const { db } = require('../lib/db/index');
const { iamRole, user } = require('../lib/db/schema');
const { eq, or, ilike } = require('drizzle-orm');
const dotenv = require('dotenv');
dotenv.config();

async function runAudit() {
  console.log("--- IAM FORENSIC AUDIT START ---");

  try {
    // 1. Identify current user (System Administrator)
    // In the screenshot: Mugarura Johnson
    const [currentUser] = await db.select().from(user).where(ilike(user.name, '%Mugarura%')).limit(1);

    if (!currentUser) {
      console.error("❌ Current user 'Mugarura' not found in DB.");
      const allUsers = await db.select({ name: user.name }).from(user).limit(5);
      console.log("Found Users:", allUsers.map(u => u.name));
      return;
    }

    console.log(`Current User: ${currentUser.name} | Role: ${currentUser.role} | IAM Role ID: ${currentUser.iamRoleId}`);

    // 2. Identify Target Role (Area Engineer)
    const roles = await db.select().from(iamRole);
    const areaEngineer = roles.find(r => r.name.toLowerCase().includes('area engineer'));

    if (!areaEngineer) {
      console.error("❌ Target role 'Area Engineer' not found in system.");
      // List available roles to help diagnose
      console.log("Available Roles:", roles.map(r => `${r.name} (Level: ${r.level}, Code: ${r.code})`).join(", "));
      return;
    }

    console.log(`Target Role: ${areaEngineer.name} | Level: ${areaEngineer.level} | Code: ${areaEngineer.code} | ID: ${areaEngineer.id}`);

    // 3. Check Rank Logic (legacy)
    const legacyRoleRank = {
       "admin": 100,
       "head_commercial": 80,
       "finance_officer": 80,
       "cluster_manager": 50,
       "commercial_officer": 50,
       "agent": 10,
    };

    const currentLegacyRank = legacyRoleRank[currentUser.role] || 0;
    console.log(`Current Legacy Rank: ${currentLegacyRank}`);

    // 4. Check IAM Level Logic (modern)
    const currentIamRole = roles.find(r => r.id === currentUser.iamRoleId);
    const currentIamLevel = currentIamRole?.level || 0;
    console.log(`Current IAM Level: ${currentIamLevel}`);

    // 5. Evaluate AUTHORIZATION
    const targetLegacyRank = legacyRoleRank[areaEngineer.code] || 0;
    const canAssignLegacy = currentLegacyRank >= targetLegacyRank;
    const canAssignIam = currentIamLevel >= areaEngineer.level;

    console.log("\n--- AUTHORIZATION ANALYSIS ---");
    console.log(`Legacy Role Matching (${currentLegacyRank} >= ${targetLegacyRank}): ${canAssignLegacy ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`IAM Level Matching (${currentIamLevel} >= ${areaEngineer.level}): ${canAssignIam ? '✅ PASS' : '❌ FAIL'}`);

    if (!canAssignIam && currentUser.role === 'admin') {
       console.log(`\n🔎 ROOT CAUSE: The 'Area Engineer' role has an IAM level of ${areaEngineer.level}, which is higher than your current role level of ${currentIamLevel}.`);
       console.log(`System Administrator role usually has level 100, but your assigned IAM role might have a lower level.`);
    } else {
       console.log("\n🔎 Code Logic should allow this. Checking for UI-only validation bugs...");
    }

  } catch (err) {
    console.error("Audit failed with error:", err.message);
  } finally {
    process.exit(0);
  }
}

runAudit();
