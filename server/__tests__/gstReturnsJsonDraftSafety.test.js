const express = require('express');
const request = require('supertest');

jest.mock('../models/Invoice');
jest.mock('../models/SystemSettings');
jest.mock('../middleware/authorize', () => ({
  authorize: jest.fn(() => (req, _res, next) => next())
}));

const Invoice = require('../models/Invoice');
const SystemSettings = require('../models/SystemSettings');
const router = require('../routes/finance/gstReturns');

function queryResult(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('GSTR-3B JSON draft safety', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    SystemSettings.findOne.mockResolvedValue({ firmGstin: '09AAACG1234F1Z5' });
    Invoice.find.mockImplementation(query => query.type === 'sale'
      ? queryResult([{ baseAmount: 1000, cgst: 60, sgst: 60, igst: 0 }])
      : queryResult([{ baseAmount: 500, cgst: 30, sgst: 30, igst: 0 }]));
  });

  test('never labels unverified purchase tax as eligible ITC', async () => {
    const response = await request(app).get('/gstr3b/export-json?month=9&year=2026');

    expect(response.status).toBe(200);
    expect(response.body.draftOnly).toBe(true);
    expect(response.body.filingReady).toBe(false);
    expect(response.body.sec_sum.osup_det).toMatchObject({
      txval: 1000, camt: 60, samt: 60, iamt: 0
    });
    expect(response.body.sec_sum).not.toHaveProperty('itc_elg');
    expect(JSON.stringify(response.body)).not.toContain('itc_avl');
    expect(response.body.limitations.join(' ')).toContain('eligibility has not been verified');
  });

  test('blocks export when any finalized invoice has an unquantified taxable base', async () => {
    Invoice.find.mockImplementation(query => query.type === 'sale'
      ? queryResult([{ baseAmount: 1000 }])
      : queryResult([{ baseAmount: null }]));

    const response = await request(app).get('/gstr3b/export-json?month=9&year=2026');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GST_EXPORT_UNQUANTIFIED_TAXABLE_BASE');
    expect(response.body.unquantifiedPurchaseInvoiceCount).toBe(1);
  });
});