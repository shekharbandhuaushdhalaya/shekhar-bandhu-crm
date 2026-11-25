const express = require('express');
const request = require('supertest');

jest.mock('../models/Invoice');
jest.mock('../models/CreditNote');
jest.mock('../middleware/authorize', () => ({
  authorize: jest.fn(() => (req, _res, next) => next())
}));

const Invoice = require('../models/Invoice');
const CreditNote = require('../models/CreditNote');
const router = require('../routes/finance/gstReturns');

function queryResult(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('GST report preparation safeguards', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.find.mockImplementation(query => query.type === 'sale'
      ? queryResult([{ invoiceNo: 'S-1', date: new Date('2026-09-10'), amount: 1180, baseAmount: 1000, cgst: 90, sgst: 90, igst: 0, gstin: '09AAACG1234F1Z5' }])
      : queryResult([{ invoiceNo: 'P-1', amount: 590, baseAmount: 500, cgst: 45, sgst: 45, igst: 0 }]));
    CreditNote.find.mockImplementation(query => {
      if (query.partyType === 'Customer') return queryResult([
        { type: 'credit_note', totalAmount: 118 },
        { type: 'debit_note', baseAmount: 20, totalAmount: 23.6 },
        { type: 'debit_note', baseAmount: -5, totalAmount: 0 }
      ]);
      return queryResult([
        { type: 'credit_note', baseAmount: 50, totalAmount: 59 },
        { type: 'debit_note', totalAmount: 59 }
      ]);
    });
  });

  test('GSTR-1 never substitutes a tax-inclusive note total for a missing taxable base', async () => {
    const response = await request(app).get('/gstr1?month=9&year=2026');
    expect(response.status).toBe(200);
    expect(response.body.totalTaxableValue).toBe(1020);
    expect(response.body.table9B_CreditNotes).toMatchObject({
      count: 1, baseAmount: 0, unquantifiedBaseAmountCount: 1
    });
    expect(response.body.table9B_CreditNotes.items[0]).toMatchObject({
      baseAmount: 0, baseAmountMissing: true, totalAmount: 118
    });
    expect(response.body.table9B_DebitNotes).toMatchObject({
      baseAmount: 20, unquantifiedBaseAmountCount: 1
    });
    expect(response.body.table9B_DebitNotes.items[1]).toMatchObject({ baseAmount: 0, baseAmountMissing: true });
  });


  test('reports missing invoice taxable bases instead of silently treating them as zero', async () => {
    Invoice.find.mockImplementation(query => query.type === 'sale'
      ? queryResult([{ invoiceNo: 'S-MISSING', date: new Date('2026-09-10'), amount: 118, gstin: '09AAACG1234F1Z5' }])
      : queryResult([]));
    CreditNote.find.mockReturnValue(queryResult([]));

    const response = await request(app).get('/gstr1?month=9&year=2026');
    expect(response.status).toBe(200);
    expect(response.body.grossTaxableValue).toBe(0);
    expect(response.body.unquantifiedInvoiceBaseAmountCount).toBe(1);
    expect(response.body.b2b[0]).toMatchObject({ taxableValue: 0, taxableValueMissing: true });
  });

  test('GSTR-3B distinguishes recorded purchase GST from verified eligible ITC', async () => {
    const response = await request(app).get('/gstr3b?month=9&year=2026');
    expect(response.status).toBe(200);
    expect(response.body.outwardSupplies).toMatchObject({
      taxableValue: 1020, unquantifiedCreditDebitNoteBaseAmountCount: 2
    });
    expect(response.body.inwardSupplies).toMatchObject({
      taxableValue: 450,
      totalRecordedPurchaseTax: 90,
      itcEligibilityVerified: false,
      unquantifiedCreditDebitNoteBaseAmountCount: 1
    });
    expect(response.body.limitations.join(' ')).toContain('not verified eligible input tax credit');
  });

  test('rejects malformed and out-of-range periods on all monthly GST report endpoints', async () => {
    for (const path of [
      '/gstr1?month=9abc&year=2026',
      '/gstr3b?month=13&year=2026',
      '/gstr1/export-json?month=0&year=2026',
      '/gstr3b/export-json?month=9&year=20x6',
      '/gstr1?month=9&year=2016'
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('GST_REPORT_PERIOD_INVALID');
    }
    expect(Invoice.find).not.toHaveBeenCalled();
    expect(CreditNote.find).not.toHaveBeenCalled();
  });

  test('uses the selected calendar month and exclusive next-month boundary', async () => {
    const response = await request(app).get('/gstr1?month=09&year=2026');
    expect(response.status).toBe(200);
    expect(Invoice.find).toHaveBeenCalledWith({
      type: 'sale',
      isFinalized: true,
      date: { $gte: new Date('2026-09-01T00:00:00.000Z'), $lt: new Date('2026-10-01T00:00:00.000Z') }
    });
  });
});
