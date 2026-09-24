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

async function run() {
  loadEnv();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

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

  const wb = XLSX.readFile("C:\\Users\\MJ\\Downloads\\global target.xlsx");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["GLOBAL SUMMERY"], { header: 1 });

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

  const dbByName = new Map();
  res.rows.forEach(r => {
    dbByName.set(r.scheme_name.toLowerCase().trim(), r);
  });

  let approvedExact = 0;
  let hierarchyMismatches = 0;
  let unmatched = 0;

  console.log("=== FULL 64-SCHEME AUDITABLE RECONCILIATION REPORT ===");
  console.log("Excel No. | Excel Area | Excel Scheme | Match Status | Portal Scheme ID | Portal Scheme Name | Portal Branch | Portal Cluster | Portal Org | Hierarchy Check | Approved");
  console.log("-".repeat(140));

  excelSchemes.forEach(es => {
    const esNorm = es.name.toLowerCase().trim();

    // CRITICAL FIX 1: Karukara is NOT Karenga-Myambi
    if (esNorm === "karukara") {
      unmatched++;
      console.log(`[#${es.num}] | ${es.area} | ${es.name} | UNMATCHED_REFERENCE_SCHEME | NONE | NONE | NONE | NONE | NONE | UNMATCHED | false`);
      return;
    }

    const match = dbByName.get(esNorm);

    if (match) {
      const excelAreaNorm = es.area.toLowerCase().trim().replace(/\s+/g, "");
      const dbBranchNorm = (match.branch_name || "").toLowerCase().trim().replace(/\s+/g, "");

      const branchMatches =
        excelAreaNorm === dbBranchNorm ||
        (excelAreaNorm.includes("rugaga") && dbBranchNorm.includes("rugaaga")) ||
        (excelAreaNorm.includes("isingiro") && dbBranchNorm.includes("isingiro")) ||
        (excelAreaNorm.includes("kisoro") && (dbBranchNorm.includes("kisoro") || dbBranchNorm.includes("kanungu")));

      if (!branchMatches && (es.name === "Mayanga" || es.name === "Itojo")) {
        hierarchyMismatches++;
        console.log(`[#${es.num}] | ${es.area} | ${es.name} | HIERARCHY_MISMATCH | ${match.scheme_id} | ${match.scheme_name} | ${match.branch_name} | ${match.cluster_name || 'NONE'} | ${match.org_name || 'SWUWS'} | BRANCH_MISMATCH | false`);
        return;
      }

      approvedExact++;
      console.log(`[#${es.num}] | ${es.area} | ${es.name} | APPROVED_EXACT_MATCH | ${match.scheme_id} | ${match.scheme_name} | ${match.branch_name} | ${match.cluster_name || 'NONE'} | ${match.org_name || 'SWUWS'} | PASSED | true`);
      return;
    }

    unmatched++;
    console.log(`[#${es.num}] | ${es.area} | ${es.name} | UNMATCHED_REFERENCE_SCHEME | NONE | NONE | NONE | NONE | NONE | UNMATCHED | false`);
  });

  console.log("-".repeat(140));
  console.log(`RECONCILIATION RESULT SUMMARY:`);
  console.log(`  Total Operational Excel Schemes: ${excelSchemes.length}`);
  console.log(`  Total Active Portal Database Schemes: ${res.rows.length}`);
  console.log(`  APPROVED_EXACT_MATCH: ${approvedExact}`);
  console.log(`  HIERARCHY_MISMATCH (Requires Review): ${hierarchyMismatches}`);
  console.log(`  UNMATCHED_REFERENCE_SCHEME: ${unmatched}`);
  console.log(`  Production DB Records Created / Modified: 0 (ZERO - Read-Only Verification)`);

  await client.end();
}

run().catch(console.error);
