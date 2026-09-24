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
  console.log("Connected to Live Postgres DB for Deep Search!");

  // Fetch all water schemes and branches
  const schemesRes = await client.query(`
    SELECT
      ws.id as scheme_id,
      ws.name as scheme_name,
      ws.code as scheme_code,
      ws."serviceArea",
      b.id as branch_id,
      b.name as branch_name,
      c.id as cluster_id,
      c.name as cluster_name
    FROM water_scheme ws
    LEFT JOIN branch b ON ws."branchId" = b.id
    LEFT JOIN cluster c ON b."clusterId" = c.id
    WHERE ws.active = true;
  `);

  console.log(`Total DB Active Schemes: ${schemesRes.rows.length}`);

  const unmatchedTarget = [
    { num: 23, area: "KISORO & KANUNGU", name: "Rushaga" },
    { num: 39, area: "Ntungamo", name: "Kakigani" },
    { num: 46, area: "ISINGIRO MAIN", name: "Rwentango" },
    { num: 53, area: "BUSHENYI", name: "Matsyoro" },
    { num: 57, area: "IBANDA", name: "Kanyarugiri" },
    { num: 62, area: "RUBIRIZI", name: "Kisenyi" },
  ];

  console.log("\n=== DEEP SEARCH FOR 6 UNMATCHED SCHEMES ===");

  for (const target of unmatchedTarget) {
    console.log(`\nSearching for #${target.num} [${target.name}] in Area: "${target.area}"...`);

    // Search DB by substring in scheme_name, code, or serviceArea
    const matches = schemesRes.rows.filter(r => {
      const sName = r.scheme_name.toLowerCase();
      const sCode = (r.scheme_code || "").toLowerCase();
      const sArea = (r.serviceArea || "").toLowerCase();
      const tName = target.name.toLowerCase();

      return sName.includes(tName) || tName.includes(sName) || sCode.includes(tName) || sArea.includes(tName);
    });

    if (matches.length > 0) {
      matches.forEach(m => {
        console.log(`  FOUND POTENTIAL DB MATCH: DB Scheme Name="${m.scheme_name}" | DB Code="${m.scheme_code}" | DB Branch="${m.branch_name}" | DB ID=${m.scheme_id}`);
      });
    } else {
      console.log(`  NO DB MATCH FOUND for "${target.name}". Confirmed UNMATCHED_REFERENCE_SCHEME.`);
    }
  }

  // Also inspect the 2 normalized matches
  console.log("\n=== REVIEW OF 2 NORMALIZED MATCHES ===");
  const normTargets = [
    { name: "Karukara", area: "KABALE" },
    { name: "Karenga-Myambi", area: "NYARUSHANJE" }
  ];

  for (const nt of normTargets) {
    const esNameNorm = nt.name.toLowerCase().trim();
    const match = schemesRes.rows.find(r => r.scheme_name.toLowerCase().trim() === esNameNorm || r.scheme_name.toLowerCase().includes("karukara") || r.scheme_name.toLowerCase().includes("karenga"));
    if (match) {
      console.log(`Normalized Target: "${nt.name}" -> DB Scheme Name="${match.scheme_name}" | DB Code="${match.scheme_code}" | DB Branch="${match.branch_name}" | DB ID=${match.scheme_id}`);
    }
  }

  await client.end();
}

run().catch(console.error);
