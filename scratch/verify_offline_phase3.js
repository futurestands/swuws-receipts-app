const fs = require('fs');

function verifyFiles() {
  console.log("--- VERIFYING OFFLINE PHASE 3 FILES ---");
  const files = [
    'app/dashboard/offline/OfflineMeterReadingForm.tsx',
    'app/actions/offline-upload.ts',
    'lib/offline/sqlite-service.ts',
    'app/dashboard/offline/OfflineSearchClient.tsx'
  ];

  files.forEach(f => {
    if (fs.existsSync(f)) {
      console.log(`✅ File exists: ${f}`);
    } else {
      console.log(`❌ File missing: ${f}`);
    }
  });

  const sqliteContent = fs.readFileSync('lib/offline/sqlite-service.ts', 'utf8');
  if (sqliteContent.includes('local_meter_readings') && sqliteContent.includes('enqueueMeterReading')) {
    console.log("✅ sqlite-service.ts contains local_meter_readings schema and methods");
  } else {
    console.log("❌ sqlite-service.ts missing meter reading logic");
  }

  const uploadContent = fs.readFileSync('app/actions/offline-upload.ts', 'utf8');
  if (uploadContent.includes('syncOfflineMeterReadingBatch')) {
    console.log("✅ offline-upload.ts contains syncOfflineMeterReadingBatch");
  } else {
    console.log("❌ offline-upload.ts missing meter reading sync logic");
  }

  const clientContent = fs.readFileSync('app/dashboard/offline/OfflineSearchClient.tsx', 'utf8');
  if (clientContent.includes('OfflineMeterReadingForm') && clientContent.includes('syncOfflineMeterReadingBatch')) {
    console.log("✅ OfflineSearchClient.tsx integrated with meter reading support");
  } else {
    console.log("❌ OfflineSearchClient.tsx missing meter reading integration");
  }
}

verifyFiles();
