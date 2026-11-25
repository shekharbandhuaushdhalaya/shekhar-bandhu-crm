const { getInvoiceAgeMetrics } = require('../services/invoiceAgingService');

describe('Invoice ageing buckets', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');

  test('separates invoices not yet due from overdue balances', () => {
    expect(getInvoiceAgeMetrics({ date: new Date('2026-11-01'), dueDate: new Date('2026-12-01') }, now))
      .toMatchObject({ daysOld: 24, daysOverdue: 0, bucket: 'notDue', label: 'Not due' });
    expect(getInvoiceAgeMetrics({ date: new Date('2026-11-01'), dueDate: new Date('2026-11-24') }, now))
      .toMatchObject({ daysOld: 24, daysOverdue: 1, bucket: 'b0_30', label: '0-30' });
  });

  test('uses distinct overdue brackets while preserving invoice age', () => {
    expect(getInvoiceAgeMetrics({ date: new Date('2026-08-01'), dueDate: new Date('2026-10-20') }, now))
      .toMatchObject({ daysOld: 116, daysOverdue: 36, bucket: 'b31_60', label: '31-60' });
    expect(getInvoiceAgeMetrics({ date: new Date('2026-01-01'), dueDate: new Date('2026-08-01') }, now))
      .toMatchObject({ bucket: 'b90_plus', label: '90+' });
  });

  test('uses invoice date only when no due date is recorded', () => {
    expect(getInvoiceAgeMetrics({ date: new Date('2026-11-20') }, now))
      .toMatchObject({ daysOld: 5, daysOverdue: 5, bucket: 'b0_30' });
  });
});
