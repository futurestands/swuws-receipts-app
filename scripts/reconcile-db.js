import pkg from "pg"
const { Client } = pkg
import fs from "fs"
import path from "path"
import { fileURLToPath } from 'url'
import XLSX from "xlsx"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

async function reconcile() {
  loadEnv();
  const connStr = process.env.DATABASE_URL;

  if (!connStr) {
    console.log("DATABASE RECONCILIATION NOT COMPLETED (DATABASE_URL not set)");
    return;
  }

  let clientConfig;
  try {
    const url = new URL(connStr);
    clientConfig = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1) || "postgres",
      ssl: connStr.includes("supabase.com") ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    };
  } catch {
    clientConfig = {
      connectionString: connStr,
      ssl: connStr.includes("supabase.com") ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    };
  }

  const client = new Client(clientConfig);

  try {
    await client.connect();
    console.log("Connected to Live PostgreSQL Database!");

    const res = await client.query(`
      SELECT
        ws.id as scheme_id,
        ws.name as scheme_name,
        ws.code as scheme_code,
        b.id as branch_id,
        b.name as branch_name,
        c.id as cluster_id,
        c.name as cluster_name,
        o.id as org_id,
        o.name as org_name
      FROM water_scheme ws
      LEFT JOIN branch b ON ws."branchId" = b.id
      LEFT JOIN cluster c ON b."clusterId" = c.id
      LEFT JOIN organization o ON c."organizationId" = o.id
      WHERE ws.active = true;
    `);

    console.log(`Live DB Active Water Schemes Count: ${res.rows.length}`);

    // Read Excel File
    const excelPath = "C:\\Users\\MJ\\Downloads\\global target.xlsx";
    if (!fs.existsSync(excelPath)) {
      console.log("Excel file not found at " + excelPath);
      await client.end();
      return;
    }

    const wb = XLSX.readFile(excelPath);
    const summerySheet = wb.Sheets["GLOBAL SUMMERY"];
    const rows = XLSX.utils.sheet_to_json(summerySheet, { header: 1 });

    const excelSchemes = [];
    let currArea = "KABALE";
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const colArea = row[0] ? String(row[0]).trim() : "";
      const colNum = row[1];
      const colScheme = row[2] ? String(row[2]).trim() : "";

      if (colArea && colArea !== "Total sold" && colArea !== "No." && colArea !== "Total") {
        currArea = colArea;
      }

      if (colScheme && colScheme !== "Scheme" && colScheme !== "Total" && colScheme !== "N/A") {
        const isOp = typeof colNum === "number" || (typeof colNum === "string" && !isNaN(Number(colNum)) && Number(colNum) > 0);
        if (isOp) {
          excelSchemes.push({
            num: colNum,
            area: currArea,
            name: colScheme,
          });
        }
      }
    }

    console.log(`Excel Operational Schemes Count: ${excelSchemes.length}`);

    // Map DB schemes by normalized name and code
    const dbSchemesByName = new Map();
    const dbSchemesByCode = new Map();
    res.rows.forEach((r) => {
      if (r.scheme_name) dbSchemesByName.set(r.scheme_name.toLowerCase().trim(), r);
      if (r.scheme_code) dbSchemesByCode.set(r.scheme_code.toLowerCase().trim(), r);
    });

    let exactMatches = 0;
    let normalizedMatches = 0;
    let unmatched = 0;

    console.log("\n=== RECONCILIATION SAMPLE RESULTS ===");
    excelSchemes.forEach((es, idx) => {
      const esNameNorm = es.name.toLowerCase().trim();
      let match = dbSchemesByName.get(esNameNorm);
      let matchStatus = "NO_MATCH";

      if (match) {
        matchStatus = "EXACT_NAME_MATCH";
        exactMatches++;
      } else {
        // Try fuzzy / partial match
        const found = res.rows.find((r) => r.scheme_name && (r.scheme_name.toLowerCase().includes(esNameNorm) || esNameNorm.includes(r.scheme_name.toLowerCase())));
        if (found) {
          match = found;
          matchStatus = "NORMALIZED_NAME_MATCH";
          normalizedMatches++;
        } else {
          unmatched++;
        }
      }

      if (idx < 15) {
        console.log(`[#${es.num}] Excel Area: ${es.area} | Excel Scheme: "${es.name}" | Status: ${matchStatus} | DB ID: ${match?.scheme_id || 'NONE'} | DB Branch: ${match?.branch_name || 'NONE'}`);
      }
    });

    console.log(`\nReconciliation Summary: Total Operational Excel Schemes = ${excelSchemes.length}, Exact Name Matches = ${exactMatches}, Normalized Name Matches = ${normalizedMatches}, Unmatched = ${unmatched}`);

    await client.end();
  } catch (err) {
    console.error("Database Query Failed:", err.message);
    console.log("DATABASE RECONCILIATION NOT COMPLETED");
  }
}

reconcile();
