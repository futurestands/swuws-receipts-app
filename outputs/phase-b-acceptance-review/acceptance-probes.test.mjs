// Review-only acceptance probes. No SQL execution, server actions or business database connections.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
const mock = vi.hoisted(() => ({ select: vi.fn(), summary: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { select: mock.select } }));
vi.mock('@/lib/production/reporting', async original => ({ ...await original(), loadProductionSummary: mock.summary }));
import { getTrustedPerformanceDataset } from '../../lib/decision-support/performance-engine';
import { generateManagementReport } from '../../lib/decision-support/reports';
import { displayMeasurement } from '../../lib/decision-support/display';
import { getExcelReferencePerformanceDataset } from '../../lib/decision-support/excel-fixture';
import { generateBoardPackPptx } from '../../lib/decision-support/board-pack';
import { generateManagementAttentionItems } from '../../lib/decision-support/attention-engine';
import { evaluateCapacityUtilization } from '../../lib/intelligence/capacity';

const user = { id: 'review-reader', role: 'admin', organizationId: 'review-org', permissions: [], grants: [] };
function queries({ sales = '110', billing = true, target = '200' } = {}) {
  const results = [
    [{ id: 'review-scheme', name: 'Synthetic review scheme', branchId: 'review-branch' }],
    [{ id: 'review-period', periodName: 'July 2024', year: 2024, month: 7 }],
    sales === null ? [] : [{ schemeId: 'review-scheme', totalConsumptionM3: sales, totalBilledAmount: '100', readingsCount: 1 }],
    billing ? [{ schemeId: 'review-scheme', totalCurrentBilled: '100', totalArrearsBilled: '0', cashToArrears: '0', cashToCurrent: '20', totalDue: '80' }] : [],
    target === null ? [] : [{ schemeId: 'review-scheme', targetProductionM3: target, targetCollectionEfficiencyPercent: null }]
  ];
  mock.select.mockImplementation(() => {
    const rows = results.shift() ?? [];
    const builder = { from: () => builder, where: () => builder, orderBy: () => builder, limit: () => builder,
      innerJoin: () => builder, groupBy: () => builder, then: resolve => Promise.resolve(rows).then(resolve) };
    return builder;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.summary.mockResolvedValue([{ schemeId: 'review-scheme', totalWaterProducedM3: '100', totalWaterSuppliedM3: '0',
    currentCapacityM3Month: 105, loggedDaysCount: 31, available: true, suppliedComplete: false, provisionalProducedM3: '0', legacyCount: 0 }]);
});
describe('acceptance controls already satisfied', () => {
  it('withholds absent sales, billing and production targets', async () => {
    queries({ sales: null, billing: false, target: null });
    const d = await getTrustedPerformanceDataset(user, 'review-period');
    expect(d.availability).toEqual({ sales: false, billing: false, collections: false, arrears: false });
    expect(d.kpis.targetProductionM3).toBeNull();
    expect(generateManagementReport('commercial_performance', d).summaryNarrative).toContain('Unresolved');
  });
  it('does not substitute the balance-derived cash estimate for verified collections', async () => {
    queries(); const d = await getTrustedPerformanceDataset(user, 'review-period');
    expect(d.kpis.totalCashCollectedUgx).toBe(20);
    expect(d.collectionBasis).toBe('balance_inference');
    expect(generateManagementReport('commercial_performance', d).summaryNarrative).toContain('verified cash: Unresolved');
  });
  it('preserves explicitly recorded zero sales and zero targets', async () => {
    queries({ sales: '0', target: '0' }); const d = await getTrustedPerformanceDataset(user, 'review-period');
    expect(d.availability.sales).toBe(true); expect(d.kpis.waterSoldM3).toBe(0); expect(d.kpis.targetProductionM3).toBe(0);
  });
  it('does not invent an effective reporting year for original workbook observations', () => {
    const d = getExcelReferencePerformanceDataset('august'); expect(d.period.year).toBeNull();
    expect(d.dataQuality.coverageKnown).toBe(false); expect(d.production.suppliedComplete).toBe(false);
  });
});
describe('required acceptance guarantees not yet established', () => {
  it('pins a past month capacity when current source configuration changes', async () => {
    const { loadProductionSummary } = await vi.importActual('../../lib/production/reporting');
    const summary = async daily => {
      const results = [[{ schemeId: 'review-scheme', totalWaterProducedM3: '100', totalWaterSuppliedM3: '0', logsCount: 1, loggedDaysCount: 1, unknownSuppliedCount: 1 }],
        [{ schemeId: 'review-scheme', sourceCount: 1, unconfirmed: 0, capacity: String(daily) }]];
      const client = { select: () => { const rows = results.shift(); const b = { from: () => b, where: () => b, groupBy: () => Promise.resolve(rows) }; return b; } };
      return (await loadProductionSummary(client, ['review-scheme'], '2024-07'))[0].currentCapacityM3Month;
    };
    expect(await summary(200)).toBe(await summary(100));
  });
  it('rejects a nonfinite persisted target instead of exposing NaN as a target', async () => {
    queries({ target: 'NaN' }); const d = await getTrustedPerformanceDataset(user, 'review-period');
    expect(d.kpis.targetProductionM3).toBeNull();
  });
  it('requires affirmative measurement provenance rather than failing open when flags are omitted', () => {
    expect(displayMeasurement(85, undefined, 'percent')).toBe('Unresolved');
  });
  it('keeps a verified capacity exception independent from absent sales', async () => {
    queries({ sales: null }); const d = await getTrustedPerformanceDataset(user, 'review-period');
    expect(d.schemesMatrix[0].statusLabel).toBe('Critical (>95%)');
    expect(generateManagementAttentionItems(d).some(f => f.category === 'capacity')).toBe(true);
  });
  it('does not round a below-50 utilisation out of the underused finding band', () => {
    const findings = evaluateCapacityUtilization({ schemeId: 'review-scheme', schemeName: 'Synthetic review scheme',
      practicalCapacityM3Month: 100, actualProductionM3Month: 49.999, dataCompletenessPercent: 100 });
    expect(findings.some(f => f.id === 'cap-underutilized-review-scheme')).toBe(true);
  });
  it('does not label undated, unapproved workbook targets as approved TPS targets', async () => {
    const zip = await JSZip.loadAsync(await generateBoardPackPptx(getExcelReferencePerformanceDataset('august')));
    expect(await zip.file('ppt/slides/slide4.xml').async('string')).not.toContain('Approved TPS Targets');
  });
  it('does not assert that no open management actions exist without action-register evidence', async () => {
    queries(); const d = await getTrustedPerformanceDataset(user, 'review-period');
    const zip = await JSZip.loadAsync(await generateBoardPackPptx(d));
    expect(await zip.file('ppt/slides/slide12.xml').async('string')).not.toContain('No open management actions recorded');
  });
});
