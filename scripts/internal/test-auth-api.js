const { betterAuth } = require("better-auth");
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

const auth = betterAuth({
    database: pool,
    emailAndPassword: { enabled: true }
});

async function run() {
    try {
        console.log("Calling signUpEmail...");
        // Use a definitely new email to avoid conflict
        const result = await auth.api.signUpEmail({
            body: {
                email: `test-${Date.now()}@example.com`,
                password: "password123",
                name: "Test User"
            }
        });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}

run();
