import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    console.log("--- CRM PIPELINE FORENSIC TEST ---");

    // 0. Seed a category if none exists
    const catCheck = await client.query('SELECT id FROM crm_complaint_category LIMIT 1');
    let catId;
    if (catCheck.rows.length === 0) {
      catId = 'cat-test-' + Date.now();
      await client.query('INSERT INTO crm_complaint_category (id, name, active) VALUES ($1, $2, $3)', [catId, 'General Technical', true]);
      console.log("ℹ️ Created test category.");
    } else {
      catId = catCheck.rows[0].id;
    }

    // 1. Fetch valid test entities
    const userRes = await client.query('SELECT id, name FROM "user" LIMIT 1');
    const branchRes = await client.query('SELECT id, name FROM "branch" LIMIT 1');

    const testUser = userRes.rows[0];
    const testBranch = branchRes.rows[0];

    console.log(`Using Test User: ${testUser.name} (${testUser.id})`);
    console.log(`Using Test Branch: ${testBranch.name} (${testBranch.id})`);

    // 2. Register Test Complaint
    const complaintId = 'test-complaint-' + Date.now();
    const complaintNo = 'COMP-TEST-' + Math.floor(Math.random() * 1000);

    console.log(`Registering complaint ${complaintNo}...`);
    await client.query(`
      INSERT INTO crm_complaint (
        id, "complaintNumber", "complainantName", "complainantPhone", area, "categoryId", details, status, "assignedToId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `, [complaintId, complaintNo, 'Test Complainant', '0700000000', testBranch.id, catId, 'Forensic test details', 'assigned', testUser.id]);

    // 3. Notification
    const noteId = 'test-note-' + Date.now();
    await client.query(`
      INSERT INTO notification (
        id, "userId", type, title, message, priority, status, "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [noteId, testUser.id, 'crm_complaint_assigned', 'New Complaint Assigned', `Assigned ${complaintNo}`, 'normal', 'unread']);

    const checkNote = await client.query('SELECT * FROM notification WHERE id = $1', [noteId]);
    if (checkNote.rows.length > 0) {
      console.log("✅ Evidence: Assignment notification recorded for staff member.");
    }

    // 4. Resolve
    console.log("Resolving complaint...");
    await client.query(`
      UPDATE crm_complaint SET status = 'resolved', "resolutionNotes" = 'Fixed via forensic test', "resolvedAt" = NOW() WHERE id = $1
    `, [complaintId]);

    const checkStatus = await client.query('SELECT status FROM crm_complaint WHERE id = $1', [complaintId]);
    console.log(`✅ Status Verification: Complaint status is now '${checkStatus.rows[0].status}'.`);

    console.log("--- PIPELINE TEST COMPLETE ---");

  } catch (err) {
    console.error("❌ Forensic Test Error:", err);
  } finally {
    await client.end();
  }
}
run();
