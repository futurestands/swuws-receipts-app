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
        console.log("Calling signUpEmail WITHOUT headers...");
        const result = await auth.api.signUpEmail({
            body: {
                email: `test-no-headers-${Date.now()}@example.com`,
                password: "password123",
                name: "Test User"
            }
        });
        console.log("Result WITHOUT headers:", result);
    } catch (e) {
        console.error("Error WITHOUT headers:", e.message);
    }

    try {
        console.log("\nCalling signUpEmail WITH simulated headers...");
        const result = await auth.api.signUpEmail({
            body: {
                email: `test-with-headers-${Date.now()}@example.com`,
                password: "password123",
                name: "Test User"
            },
            headers: new Headers({
                "host": "localhost:3000",
                "user-agent": "test"
            })
        });
        console.log("Result WITH headers:", result);
    } catch (e) {
        console.error("Error WITH headers:", e.message);
    }

    await pool.end();
}

run();
