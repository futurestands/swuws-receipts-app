import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

function canViewAllData(user) {
  if (user.role === 'admin' || (user.roleLevel ?? 0) >= 8) return true
  const perms = user.permissions
  if (!perms) return false
  const globalRequiredPerms = ["reports.view", "dashboard.view", "reconciliation.view", "system.audit.view"]
  for (const p of perms) {
    if (p && typeof p === "object" && "scope" in p && p.scope === "global") {
      if (globalRequiredPerms.includes(p.code)) return true
    }
  }
  return false
}

function getScope(user, permissionCode) {
  const grant = user.permissions?.find(p => p.code === permissionCode);
  let scope = grant?.scope || null;
  if (canViewAllData(user)) {
    scope = "global";
  }
  if (scope === "global") {
     if (user.clusterId) scope = "cluster"
     else if (user.branchId) scope = "area"
     else if (user.schemeId) scope = "scheme"
  }
  return scope;
}

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });
  try {
    await client.connect();
    const userRes = await client.query('SELECT * FROM "user" WHERE name ILIKE $1', ['%Nicholas%']);
    const row = userRes.rows[0];
    const roleRes = await client.query('SELECT level FROM iam_role WHERE id = $1', [row.iamRoleId]);
    const roleLevel = roleRes.rows[0]?.level || 0;
    const permRes = await client.query(`
      WITH RECURSIVE role_hierarchy AS (
        SELECT id, "parent_id" FROM iam_role WHERE id = $1
        UNION ALL
        SELECT r.id, r."parent_id" FROM iam_role r
        INNER JOIN role_hierarchy rh ON r.id = rh."parent_id"
      )
      SELECT p.code, rp.scope
      FROM iam_role_permission rp
      JOIN iam_permission p ON rp."permission_id" = p.id
      WHERE rp."role_id" IN (SELECT id FROM role_hierarchy)
    `, [row.iamRoleId]);

    const SCOPE_HIERARCHY = { "global": 4, "cluster": 3, "area": 2, "scheme": 1, "own": 0 };
    const bestGrantsMap = new Map();
    for (const g of permRes.rows) {
      const existing = bestGrantsMap.get(g.code);
      if (!existing || SCOPE_HIERARCHY[g.scope] > SCOPE_HIERARCHY[existing.scope]) {
        bestGrantsMap.set(g.code, g);
      }
    }
    const permissions = Array.from(bestGrantsMap.values());
    const current = { ...row, roleLevel, permissions };

    console.log("Assigned Branch:", current.branchId ? "YES" : "NO");
    console.log("Resolved Scope for 'reports.view':", getScope(current, "reports.view"));
    console.log("Resolved Scope for 'customers.view':", getScope(current, "customers.view"));

  } catch (err) { console.error(err); } finally { await client.end(); }
}
run();
