import { db } from "../../../lib/db"
import { sql } from "drizzle-orm"

async function test() {
  try {
    const result = await db.execute(sql`SELECT 1`)
    console.log("Connection successful:", result)
    process.exit(0)
  } catch (err) {
    console.error("Connection failed:", err)
    process.exit(1)
  }
}

test()
