const fs = require('fs');

function verifyFiles() {
  console.log("--- VERIFYING OFFLINE PHASE 2 FILES ---");
  const files = [
    'app/actions/offline-sync.ts',
    'app/actions/offline-upload.ts',
    'lib/offline/sqlite-service.ts',
    'app/dashboard/offline/page.tsx',
    'app/dashboard/offline/OfflineSearchClient.tsx',
    'app/dashboard/offline/OfflineReceiptForm.tsx'
  ];

  let allFound = true;
  files.forEach(f => {
    if (fs.existsSync(f)) {
      console.log(`✅ File exists: ${f}`);
    } else {
      console.log(`❌ File missing: ${f}`);
      allFound = false;
    }
  });

  if (!allFound) return;

  // Structural check: sqlite-service.ts
  const sqliteContent = fs.readFileSync('lib/offline/sqlite-service.ts', 'utf8');
  if (sqliteContent.includes('local_receipt_queue') && sqliteContent.includes('enqueueReceipt')) {
    console.log("✅ sqlite-service.ts contains local_receipt_queue schema and methods");
  } else {
    console.log("❌ sqlite-service.ts missing receipt queue logic");
  }

  // Structural check: OfflineSearchClient.tsx
  const clientContent = fs.readFileSync('app/dashboard/offline/OfflineSearchClient.tsx', 'utf8');
  if (clientContent.includes('syncOfflineReceiptBatch') && clientContent.includes('handleSyncPush')) {
    console.log("✅ OfflineSearchClient.tsx integrated with sync upload logic");
  } else {
    console.log("❌ OfflineSearchClient.tsx missing sync upload integration");
  }

  // Structural check: OfflineReceiptForm.tsx
  const formContent = fs.readFileSync('app/dashboard/offline/OfflineReceiptForm.tsx', 'utf8');
  if (formContent.includes('sqliteService.enqueueReceipt')) {
    console.log("✅ OfflineReceiptForm.tsx integrated with enqueueReceipt");
  } else {
    console.log("❌ OfflineReceiptForm.tsx missing enqueue logic");
  }
}

verifyFiles();
