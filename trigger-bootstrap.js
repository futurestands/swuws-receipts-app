const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { sql } = require("drizzle-orm");

const pool = new Pool({
    connectionString: "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

const auth = betterAuth({
    database: pool,
    emailAndPassword: { enabled: true }
});

const db = drizzle(pool);

async function bootstrapAdmin(input) {
  console.log("ENTER: bootstrapAdmin for", input.email);

  try {
    console.log("EXEC: db.transaction");
    return await db.transaction(async (tx) => {
      console.log("ENTER: tx callback");

      // Check existing
      const res = await tx.execute(sql`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`);
      const existing = res.rows.length > 0;
      console.log("CHECK: existing admin =", existing);

      if (existing) {
        return { ok: false, error: "Setup already completed" };
      }

      console.log("CALL: auth.api.signUpEmail");
      let created;
      try {
        created = await auth.api.signUpEmail({
          body: {
            name: input.name.trim(),
            email: input.email.trim().toLowerCase(),
            password: input.password,
          }
        });
        console.log("RESULT: auth.api.signUpEmail success");
      } catch (authErr) {
        console.error("FAIL: auth.api.signUpEmail threw", authErr.message);
        throw authErr;
      }

      if (!created?.user?.id) {
        console.error("FAIL: Better Auth returned without user id", created);
        return { ok: false, error: "Failed to create admin" };
      }

      console.log("EXEC: update role to admin for", created.user.id);
      await tx.execute(sql`UPDATE "user" SET role = 'admin', "updatedAt" = NOW() WHERE id = ${created.user.id}`);
      console.log("SUCCESS: update role");

      return { ok: true };
    });
  } catch (e) {
    console.error("FAIL: bootstrapAdmin (catch all)", e.message);
    return {
      ok: false,
      error: e.message,
    };
  }
}

bootstrapAdmin({
    name: "Forensic Analyst",
    email: `forensic-${Date.now()}@example.com`,
    password: "password123"
}).then(res => {
    console.log("Final Result:", res);
    pool.end();
}).catch(err => {
    console.error("Fatal Error:", err);
    pool.end();
});
