const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { crmDepartment, crmComplaintCategory } = require('../lib/db/schema');
const { crypto } = require('crypto');

async function seed() {
  console.log("Seeding CRM Metadata...");

  const departments = [
    { id: 'dept-revenue', name: 'Revenue and Billing', description: 'Handles billing queries and payments' },
    { id: 'dept-finance', name: 'Finance and Administration', description: 'General administration and finance' },
    { id: 'dept-technical', name: 'Technical Field', description: 'Handles repairs, leakages and installations' },
    { id: 'dept-quality', name: 'Water Quality Monitoring', description: 'Handles water testing and safety' },
    { id: 'dept-hr', name: 'Human Resources', description: 'Staff management and misconduct' },
    { id: 'dept-callcenter', name: 'Call Center', description: 'Initial complaint registration and routing' }
  ];

  const categories = [
    { name: 'No Bills', deptId: 'dept-revenue' },
    { name: 'Over Billing', deptId: 'dept-revenue' },
    { name: 'Leakage', deptId: 'dept-technical' },
    { name: 'Transmission Burst', deptId: 'dept-technical' },
    { name: 'No Water', deptId: 'dept-technical' },
    { name: 'Staff Misconduct', deptId: 'dept-hr' },
    { name: 'Water Problem', deptId: 'dept-quality' },
    { name: 'Meter Problem', deptId: 'dept-technical' },
    { name: 'New Connection', deptId: 'dept-technical' },
    { name: 'Illegal Connection', deptId: 'dept-revenue' },
    { name: 'Faulty Meter', deptId: 'dept-technical' }
  ];

  try {
    for (const d of departments) {
      await db.insert(crmDepartment).values({
        id: d.id,
        name: d.name,
        description: d.description,
        active: true
      }).onConflictDoUpdate({
        target: crmDepartment.id,
        set: { name: d.name, description: d.description }
      });
    }
    console.log("✅ Departments Seeded.");

    for (const c of categories) {
      const id = `cat-${c.name.toLowerCase().replace(/\s+/g, '-')}`;
      await db.insert(crmComplaintCategory).values({
        id,
        name: c.name,
        defaultHandlerDepartmentId: c.deptId,
        active: true
      }).onConflictDoUpdate({
        target: crmComplaintCategory.id,
        set: { defaultHandlerDepartmentId: c.deptId }
      });
    }
    console.log("✅ Complaint Categories Seeded.");
    process.exit(0);
  } catch (e) {
    console.error("Seeding failed:", e);
    process.exit(1);
  }
}

seed();
