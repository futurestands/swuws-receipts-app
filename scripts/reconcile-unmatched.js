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
  const res = await client.query('SELECT ws.id, ws.name, ws.code, b.name as branch_name FROM water_scheme ws LEFT JOIN branch b ON ws."branchId" = b.id WHERE ws.active = true;');
  const wb = XLSX.readFile("C:\\Users\\MJ\\Downloads\\global target.xlsx");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["GLOBAL SUMMERY"], { header: 1 });

  console.log("=== UNMATCHED SCHEMES AUDIT ===");
  let currArea = "";
  let unmatchedCount = 0;

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    if (row[0] && row[0] !== "Total sold" && row[0] !== "No." && row[0] !== "Total") currArea = row[0];
    const colNum = row[1];
    const colScheme = row[2] ? String(row[2]).trim() : "";
    const isOp = typeof colNum === "number" || (typeof colNum === "string" && !isNaN(Number(colNum)) && Number(colNum) > 0);

    if (colScheme && isOp) {
      const norm = colScheme.toLowerCase().trim();
      const match = res.rows.find((r) => r.name.toLowerCase().trim() === norm || r.name.toLowerCase().includes(norm) || norm.includes(r.name.toLowerCase()));
      if (!match) {
        unmatchedCount++;
        console.log(`Unmatched #${colNum}: Area="${currArea}" | Excel Scheme="${colScheme}"`);
      }
    }
  }

  console.log(`Total Unmatched: ${unmatchedCount}`);
  await client.end();
}

run().catch(console.error);
