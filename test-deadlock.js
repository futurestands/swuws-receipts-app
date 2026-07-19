const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");

const pool = new Pool({
    connectionString: "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false },
    max: 1, // FORCE SINGLE CONNECTION
    connectionTimeoutMillis: 2000
});

const db = drizzle(pool);

async function run() {
    try {
        console.log("Starting Outer Transaction...");
        await db.transaction(async (tx1) => {
            console.log("Inside Outer Transaction. Starting Inner Transaction...");
            try {
                await db.transaction(async (tx2) => {
                    console.log("Inside Inner Transaction.");
                });
            } catch (innerErr) {
                console.error("Inner Transaction Failed:", innerErr.message);
            }
        });
    } catch (outerErr) {
        console.error("Outer Transaction Failed:", outerErr.message);
    } finally {
        await pool.end();
    }
}

run();
