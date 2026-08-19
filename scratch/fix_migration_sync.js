import pkg from "pg"
const { Client } = pkg
import fs from "fs"
import path from "path"
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;
    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

async function run() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  const clientConfig = {
    connectionString,
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : false,
  };

  const client = new Client(clientConfig);
  try {
    await client.connect();

    const migrations = [
        "0005_brave_pepper_potts.sql",
        "0005_customer_and_scheme_management.sql", // There are two 0005 files?
        "0006_customer_search_indexes.sql",
        "0007_admin_plugin_columns.sql",
        "0008_rbac_foundation.sql",
        "0009_billing_module.sql",
        "0010_receipt_printing.sql",
        "0011_account_balance_sync.sql",
        "0012_receipt_billing_snapshots.sql",
        "0013_collection_period_lifecycle.sql",
        "0014_receipt_scheme_id.sql",
        "0015_iam_module.sql",
        "0016_daily_collection_foundation.sql",
        "0017_daily_collection_engine.sql",
        "0018_daily_collection_records.sql",
        "0019_reconciliation_engine.sql",
        "0020_reconciliation_exceptions.sql",
        "0021_reconciliation_approvals.sql",
        "0022_notifications_and_tasks.sql",
        "0023_production_indices.sql",
        "0024_recon_permissions.sql",
        "0025_meter_reading_module.sql",
        "0026_enterprise_templates.sql",
        "0027_meter_reading_snapshots.sql",
        "0028_meter_reading_report_fields.sql",
        "0029_template_fk_fix.sql",
        "0030_opening_arrears.sql",
        "0031_reporting_index_coverage.sql",
        "0032_customer_active_status.sql",
        "0033_org_settings_generalization.sql",
        "0034_receipt_org_contacts_snapshot.sql",
        "0035_customer_balance_index.sql",
        "0036_maintenance_bypass_trigger.sql",
        "0037_customer_category_tariffs.sql",
        "0038_add_developer_credit.sql",
        "0039_app_versioning.sql",
        "0040_unified_stats_and_discrepancies.sql",
        "0041_tariff_decimal_support.sql",
        "0042_financial_decimal_support.sql",
        "0043_billing_recovery_tracking.sql",
        "0044_arrears_recovery_split.sql",
        "0045_retroactive_recovery_fix.sql",
        "0046_add_maintenance_mode.sql",
        "0047_add_idempotency_keys.sql",
        "0048_crm_module.sql"
    ];

    console.log("Checking and marking migrations as applied...");

    for (const m of migrations) {
        await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
            [m]
        );
    }

    console.log("Migration sync complete.");
  } catch (err) {
    console.error("Failed:", err.message);
  } finally {
    await client.end();
  }
}

run();
