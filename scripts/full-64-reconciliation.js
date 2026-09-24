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

  // Exact Map by normalized name
  const dbByName = new Map();
  res.rows.forEach(r => {
    dbByName.set(r.scheme_name.toLowerCase().trim(), r);
  });

  let exactCount = 0;
  let unmatchedCount = 0;

  console.log("=== FULL 64-SCHEME RECONCILIATION REPORT ===");
  console.log("Num | Excel Area | Excel Scheme | Match Status | DB Scheme ID | DB Scheme Name | DB Branch");
  console.log("-".repeat(110));

  excelSchemes.forEach(es => {
    const norm = es.name.toLowerCase().trim();
    const match = dbByName.get(norm);
    let status = "UNMATCHED_REFERENCE_SCHEME";

    if (match) {
      status = "EXACT_NAME_MATCH";
      exactCount++;
    } else {
      unmatchedCount++;
    }

    console.log(`[#${es.num}] | ${es.area} | ${es.name} | ${status} | ${match?.scheme_id || 'NONE'} | ${match?.scheme_name || 'NONE'} | ${match?.branch_name || 'NONE'}`);
  });

  console.log("-".repeat(110));
  console.log(`RECONCILIATION RESULT SUMMARY:`);
  console.log(`  Total Excel Operational Schemes: ${excelSchemes.length}`);
  console.log(`  EXACT_NAME_MATCH (Approved Mapped): ${exactCount}`);
  console.log(`  UNMATCHED_REFERENCE_SCHEME: ${unmatchedCount}`);

  await client.end();
}

run().catch(console.error);
