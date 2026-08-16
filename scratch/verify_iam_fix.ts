import dotenv from "dotenv"
dotenv.config()

import { db } from "../lib/db/index"
import { iamRole, user } from "../lib/db/schema"
import { canCreateRole } from "../lib/permissions/server"
import { eq } from "drizzle-orm"

async function run() {
  console.log("--- IAM Fix Verification ---")

  // 1. Get an Admin user for context
  const [adminUser] = await db
    .select()
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1)

  if (!adminUser) {
    console.error("No admin user found for testing")
    return
  }

  // 2. Get a Plumber user for context
  const [plumberUser] = await db
    .select()
    .from(user)
    .where(eq(user.role, "agent"))
    .limit(1)

  if (!plumberUser) {
    console.error("No plumber user found for testing")
    return
  }

  // 3. Find Area Engineer role
  const [areaEngineer] = await db
    .select()
    .from(iamRole)
    .where(eq(iamRole.name, "Area Engineer"))
    .limit(1)

  if (!areaEngineer) {
    console.warn("Area Engineer role not found, using first custom role")
  }

  const targetRole = areaEngineer || (await db.select().from(iamRole).where(eq(iamRole.isSystem, false)).limit(1))[0]

  if (!targetRole) {
    console.error("No custom roles found for testing")
    return
  }

  console.log(`Testing with target role: ${targetRole.name} (Code: ${targetRole.code}, Level: ${targetRole.level})`)

  // Test Case 1: Admin can assign custom role
  const case1 = await canCreateRole(
    { ...adminUser, permissions: ["roles.manage", "users.create"] },
    targetRole.code
  )
  console.log(`Case 1 (Admin -> ${targetRole.name}): ${case1 ? "✅ PASS" : "❌ FAIL"}`)

  // Test Case 2: Plumber cannot assign custom role (even with users.create if level is too high)
  const case2 = await canCreateRole(
    { ...plumberUser, permissions: ["users.create"] },
    targetRole.code
  )
  console.log(`Case 2 (Plumber -> ${targetRole.name}): ${!case2 ? "✅ PASS (Blocked correctly)" : "❌ FAIL (Escalation allowed)"}`)

  // Test Case 3: Admin can still assign legacy role
  const case3 = await canCreateRole(
    { ...adminUser, permissions: ["users.create"] },
    "agent"
  )
  console.log(`Case 3 (Admin -> Plumber): ${case3 ? "✅ PASS" : "❌ FAIL"}`)

  // Test Case 4: Invalid role is rejected
  const case4 = await canCreateRole(
    { ...adminUser, permissions: ["users.create"] },
    "non_existent_role_123"
  )
  console.log(`Case 4 (Admin -> Invalid): ${!case4 ? "✅ PASS (Rejected correctly)" : "❌ FAIL (Accepted invalid)"}`)

  process.exit(0)
}

run()
