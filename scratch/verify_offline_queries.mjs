import initSqlJs from 'sql.js';

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  console.log("--- OFFLINE QUERY SYNTAX VERIFICATION ---");

  try {
    // 1. Replicate Table Creation
    db.run(`CREATE TABLE IF NOT EXISTS local_customers (
        id TEXT PRIMARY KEY,
        customerAccount TEXT,
        name TEXT,
        phone TEXT,
        address TEXT,
        accountBalance TEXT,
        category TEXT,
        active INTEGER,
        updatedAt TEXT
    );`);
    console.log("✅ local_customers schema valid.");

    db.run(`CREATE TABLE IF NOT EXISTS local_receipt_queue (
        id TEXT PRIMARY KEY,
        customerId TEXT,
        billingRecordId TEXT,
        amount REAL,
        paymentMethod TEXT,
        paymentReference TEXT,
        notes TEXT,
        paymentDate TEXT,
        idempotencyKey TEXT,
        status TEXT DEFAULT 'queued',
        serverReceiptId TEXT,
        error TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );`);
    console.log("✅ local_receipt_queue schema valid.");

    // 2. Replicate Search Query
    const query = "John";
    const stmt = db.prepare("SELECT * FROM local_customers WHERE name LIKE ? OR customerAccount LIKE ? LIMIT 20;");
    stmt.bind([`%${query}%`, `%${query}%`]);
    stmt.step();
    stmt.free();
    console.log("✅ Search query syntax valid.");

    // 3. Replicate Insert Query (with parameters)
    const insertStmt = db.prepare(`INSERT INTO local_receipt_queue (id, customerId, amount, paymentMethod, paymentReference, idempotencyKey, paymentDate)
                       VALUES (?, ?, ?, ?, ?, ?, ?);`);
    insertStmt.bind(['id', 'cust-id', 5000, 'cash', 'ref', 'key', 'date']);
    insertStmt.step();
    insertStmt.free();
    console.log("✅ Insert query syntax valid.");

    console.log("\n--- VERIFICATION COMPLETE: ALL OFFLINE QUERIES ARE VALID ---");

  } catch (err) {
    console.error("❌ SQL Syntax Error:", err);
  }
}

test();
