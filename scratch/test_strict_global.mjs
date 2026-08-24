function canViewAllData(user) {
  if (user.role === 'admin') return true
  if (user.clusterId || user.branchId || user.schemeId) return false
  if ((user.roleLevel ?? 0) >= 8) return true
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

const nicholas = {
  role: 'area_engineer',
  roleLevel: 5,
  branchId: 'isingiro-id',
  permissions: [{ code: 'dashboard.view', scope: 'global' }]
};

const headCommercial = {
  role: 'head_commercial',
  roleLevel: 8,
  branchId: null,
  permissions: []
};

console.log("canViewAllData(nicholas):", canViewAllData(nicholas));
console.log("canViewAllData(headCommercial):", canViewAllData(headCommercial));
