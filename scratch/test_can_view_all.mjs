const ROLES = { SYSTEM_ADMIN: 'admin' };

function canViewAllData(user) {
  if (user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 8) return true

  const perms = user.permissions
  if (!perms) return false

  for (const p of perms) {
    if (p && typeof p === "object" && "scope" in p) {
      if (p.scope === "global") return true
    }
  }
  return false
}

const nicholas = {
  role: 'area_engineer',
  roleLevel: 5,
  permissions: [
    { code: 'customers.create', scope: 'area' },
    { code: 'customers.edit', scope: 'area' },
    { code: 'customers.import', scope: 'area' },
    { code: 'customers.view', scope: 'area' },
    { code: 'dashboard.view', scope: 'own' },
    { code: 'dashboard.metrics.view', scope: 'own' },
    { code: 'users.view', scope: 'area' }
  ]
};

console.log("canViewAllData(nicholas):", canViewAllData(nicholas));
