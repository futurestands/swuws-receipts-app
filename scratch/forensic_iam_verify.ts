import dotenv from "dotenv"
dotenv.config()

import { Client } from "pg"

async function run() {
  console.log("--- IAM LOGIC FORENSIC VERIFICATION ---")

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()

  try {
    // 1. Find an Admin and a Plumber
    const userRes = await client.query('SELECT name, role, "iamRoleId" FROM "user" WHERE role IN (\'admin\', \'agent\') LIMIT 5')
    const admin = userRes.rows.find(u => u.role === 'admin')
    const agent = userRes.rows.find(u => u.role === 'agent')

    if (!admin || !agent) {
       console.log("Missing test users (admin or agent).")
       return
    }

    console.log(`Admin User: ${admin.name} (IAM Role: ${admin.iamRoleId})`)
    console.log(`Agent User: ${agent.name} (IAM Role: ${agent.iamRoleId})`)

    // 2. Find a custom role (Area Engineer)
    const roleRes = await client.query('SELECT name, code, level FROM "iam_role" WHERE name = \'Area Engineer\'')
    const areaEngineer = roleRes.rows[0]

    if (!areaEngineer) {
       console.log("Area Engineer role not found in DB.")
       return
    }

    console.log(`Target Role: ${areaEngineer.name} (Code: ${areaEngineer.code}, Level: ${areaEngineer.level})`)

    // 3. Get Admin's IAM Level
    const adminRoleRes = await client.query('SELECT level FROM "iam_role" WHERE id = $1', [admin.iamRoleId])
    const adminLevel = adminRoleRes.rows[0]?.level || 0

    // 4. Get Agent's IAM Level
    const agentRoleRes = await client.query('SELECT level FROM "iam_role" WHERE id = $1', [agent.iamRoleId])
    const agentLevel = agentRoleRes.rows[0]?.level || 0

    console.log(`Admin Level: ${adminLevel} vs Target: ${areaEngineer.level}`)
    console.log(`Agent Level: ${agentLevel} vs Target: ${areaEngineer.level}`)

    // VERIFICATION 1: Admin can assign Area Engineer
    const adminCanAssign = adminLevel >= areaEngineer.level
    console.log(`Verification 1 (Admin can assign): ${adminCanAssign ? "✅ PASS" : "❌ FAIL"}`)

    // VERIFICATION 2: Agent cannot assign Area Engineer (if level is higher)
    const agentCanAssign = agentLevel >= areaEngineer.level
    console.log(`Verification 2 (Agent blocked): ${!agentCanAssign ? "✅ PASS" : "❌ FAIL (Agent has too much power)"}`)

  } catch (err: any) {
    console.error("Verification failed:", err.message)
  } finally {
    await client.end()
    process.exit(0)
  }
}

run()
