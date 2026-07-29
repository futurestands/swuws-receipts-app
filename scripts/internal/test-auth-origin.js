const { betterAuth } = require("better-auth");
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
});

const auth = betterAuth({
    database: pool,
    baseURL: "http://localhost:3000",
    emailAndPassword: { enabled: true }
});

async function run() {
    try {
        console.log("Calling signUpEmail with MISMATCHED origin...");
        const result = await auth.api.signUpEmail({
            body: {
                email: `test-origin-${Date.now()}@example.com`,
                password: "password123",
                name: "Test User"
            },
            headers: new Headers({
                "origin": "http://attacker.com",
                "host": "localhost:3000"
            })
        });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error Message:", e.message);
    } finally {
        await pool.end();
    }
}

run();
