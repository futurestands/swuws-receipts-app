const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  });
}

const mapping = {
    "0011_receipt_billing_snapshots.sql": "0012_receipt_billing_snapshots.sql",
    "0012_collection_period_lifecycle.sql": "0013_collection_period_lifecycle.sql",
    "0013_receipt_scheme_id.sql": "0014_receipt_scheme_id.sql",
    "0014_iam_module.sql": "0015_iam_module.sql",
    "0015_daily_collection_foundation.sql": "0016_daily_collection_foundation.sql",
    "0016_daily_collection_engine.sql": "0017_daily_collection_engine.sql",
    "0017_daily_collection_records.sql": "0018_daily_collection_records.sql",
    "0018_reconciliation_engine.sql": "0019_reconciliation_engine.sql",
    "0019_reconciliation_exceptions.sql": "0020_reconciliation_exceptions.sql",
    "0020_reconciliation_approvals.sql": "0021_reconciliation_approvals.sql",
    "0021_notifications_and_tasks.sql": "0022_notifications_and_tasks.sql",
    "0022_production_indices.sql": "0023_production_indices.sql",
    "0023_recon_permissions.sql": "0024_recon_permissions.sql",
    "0024_meter_reading_module.sql": "0025_meter_reading_module.sql",
    "0025_enterprise_templates.sql": "0026_enterprise_templates.sql",
    "0025_meter_reading_snapshots.sql": "0027_meter_reading_snapshots.sql",
    "0026_meter_reading_report_fields.sql": "0028_meter_reading_report_fields.sql",
    "0026_template_fk_fix.sql": "0029_template_fk_fix.sql",
    "0027_opening_arrears.sql": "0030_opening_arrears.sql"
};

async function sync() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log("Connected to database. Syncing migration names...");

    for (const [oldName, newName] of Object.entries(mapping)) {
      const res = await client.query(
        "UPDATE schema_migrations SET filename = $1 WHERE filename = $2",
        [newName, oldName]
      );
      if (res.rowCount > 0) {
        console.log(`Updated: ${oldName} -> ${newName}`);
      }
    }

    console.log("Migration sync complete.");
  } catch (err) {
    console.error("Sync failed:", err.message);
  } finally {
    await client.end();
  }
}

sync();
