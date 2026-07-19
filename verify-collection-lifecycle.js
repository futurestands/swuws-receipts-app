const { db } = require('./lib/db');
const { billingPeriod } = require('./lib/db/schema');
const { eq, and } = require('drizzle-orm');
const { createCollectionPeriod, updateCollectionPeriodStatus } = require('./app/actions/billing');
const { createReceipt } = require('./app/actions/receipts');

// Mock requireUser for testing
const mockUser = { id: 'test-admin', role: 'system_admin', name: 'Test Admin', email: 'admin@test.com' };

async function test() {
  console.log('--- STARTING COLLECTION LIFECYCLE VERIFICATION ---');

  try {
    // 1. Cleanup existing test data if any
    console.log('Cleaning up...');
    await db.delete(billingPeriod).where(eq(billingPeriod.description, 'TEST_PERIOD'));

    // 2. Create Draft Period
    console.log('1. Creating Draft Period...');
    const p1 = await createCollectionPeriod({
      month: 7,
      year: 2026,
      name: 'July 2026',
      start: '2026-07-01',
      end: '2026-07-31',
      description: 'TEST_PERIOD'
    });
    console.log('Result:', p1);

    // 3. Transition to Validated
    console.log('2. Transitioning to Validated...');
    await updateCollectionPeriodStatus(p1.id, 'validated');
    console.log('Success');

    // 4. Transition to Active
    console.log('3. Transitioning to Active...');
    await updateCollectionPeriodStatus(p1.id, 'active');
    console.log('Success');

    // 5. Test Single Active Constraint
    console.log('4. Testing Single Active Constraint...');
    const p2 = await createCollectionPeriod({
      month: 8,
      year: 2026,
      name: 'August 2026',
      start: '2026-08-01',
      end: '2026-08-31',
      description: 'TEST_PERIOD'
    });
    await updateCollectionPeriodStatus(p2.id, 'validated');

    try {
      await updateCollectionPeriodStatus(p2.id, 'active');
      console.error('FAIL: Allowed two active periods');
    } catch (err) {
      console.log('PASS: Correctly blocked second active period:', err.message);
    }

    // 6. Test Receipt Blocking
    console.log('5. Testing Receipt Blocking (None Active)...');
    // Close p1
    await updateCollectionPeriodStatus(p1.id, 'closed');

    const receiptResult = await createReceipt({
      customerName: "Test Customer",
      amount: 1000,
      paymentMethod: "cash",
      branchId: "any"
    });

    if (!receiptResult.ok) {
      console.log('PASS: Correctly blocked receipt issuance:', receiptResult.error);
    } else {
      console.error('FAIL: Allowed receipt issuance with no active period');
    }

    console.log('--- VERIFICATION COMPLETE ---');
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
  } finally {
    process.exit(0);
  }
}

// Note: This script assumes certain database state and might need adaptation for a real run.
// It is intended as a logical verification of the implemented server actions.
// test();
