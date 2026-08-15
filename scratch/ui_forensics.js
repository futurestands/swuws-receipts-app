const fs = require('fs');

function checkFile(path, searchTerms, rejectTerms = []) {
    if (!fs.existsSync(path)) {
        console.log(`[MISSING] ${path}`);
        return;
    }
    const content = fs.readFileSync(path, 'utf8');
    console.log(`\n--- Checking: ${path} ---`);

    searchTerms.forEach(term => {
        if (content.includes(term)) {
            console.log(`✅ FOUND: "${term}"`);
        } else {
            console.log(`❌ MISSING: "${term}"`);
        }
    });

    rejectTerms.forEach(term => {
        if (content.includes(term)) {
            console.log(`⚠️ WARNING: Found legacy term "${term}"`);
        }
    });
}

console.log('--- UI TERMINOLOGY & DROPDOWN FORENSICS ---');

// 1. Check Tab Renaming
checkFile('app/admin/admin-tabs.tsx', ['<TabsTrigger value="agents" className="shrink-0">Users</TabsTrigger>'], ['>Agents</TabsTrigger>']);

// 2. Check Role Label Update
checkFile('lib/permissions/roles.ts', ['[ROLES.PLUMBER]: "Plumber (User)"'], ['"Plumber (Agent)"']);

// 3. Check Stats Panel
checkFile('app/admin/stats-panel.tsx', ['<CardTitle className="text-sm font-medium text-muted-foreground">Users</CardTitle>', "Today's collections by user"], ['Agents']);

// 4. Check Dropdown Name Fixes (UUID vs Name)
checkFile('app/admin/commercial-dashboard.tsx', [
    'periods.find(p => p.id === filters.periodId)?.periodName',
    'clusters.find(c => c.id === filters.clusterId)?.name',
    'branches.find(b => b.id === filters.branchId)?.name',
    'schemes.find(s => s.id === filters.schemeId)?.name'
]);

checkFile('app/admin/agents-panel.tsx', [
    'iamRoles.find(r => r.id === selectedIamRoleId)?.name',
    'clusters.find(c => c.id === selectedClusterId)?.name',
    'branches.find(b => b.id === selectedBranchId)?.name',
    'schemes.find(s => s.id === selectedSchemeId)?.name',
    'Edit User:',
    'Create User Account'
]);

checkFile('app/dashboard/receipt-form.tsx', [
    'bills.find(b => b.id === form.billingRecordId)',
    'schemes.find(s => s.id === form.schemeId)?.name'
]);

checkFile('app/dashboard/customers/customer-search-bar.tsx', [
    'branches.find(b => b.id === branchId)?.name',
    'schemes.find(s => s.id === schemeId)?.name'
]);
