const { betterAuth } = require("better-auth");
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");

const pool = new Pool({
    connectionString: "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

const auth = betterAuth({
    database: pool,
    emailAndPassword: { enabled: true }
});

const db = drizzle(pool);

async function run() {
    try {
        console.log("Starting Drizzle transaction...");
        await db.transaction(async (tx) => {
            console.log("Inside Drizzle transaction. Calling signUpEmail...");
            const result = await auth.api.signUpEmail({
                body: {
                    email: `test-tx-${Date.now()}@example.com`,
                    password: "password123",
                    name: "Test User"
                }
            });
            console.log("Result INSIDE transaction:", result);
        });
        console.log("Drizzle transaction committed.");
    } catch (e) {
        console.error("Error with transaction:", e.message);
    } finally {
        await pool.end();
    }
}

run();
