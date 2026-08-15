const fs = require('fs');
function verifyFiles() {
  console.log("--- VERIFYING OFFLINE PHASE 1 FILES ---");
  const files = [
    'app/actions/offline-sync.ts',
    'lib/offline/sqlite-service.ts',
    'app/dashboard/offline/page.tsx',
    'app/dashboard/offline/OfflineSearchClient.tsx'
  ];
  files.forEach(f => {
    if (fs.existsSync(f)) {
      console.log(`✅ File exists: ${f}`);
    } else {
      console.log(`❌ File missing: ${f}`);
    }
  });

  const nav = fs.readFileSync('lib/nav-config.ts', 'utf8');
  if (nav.includes('/dashboard/offline')) {
    console.log("✅ Navigation updated with Offline Search");
  } else {
    console.log("❌ Navigation update missing");
  }
}

verifyFiles();
