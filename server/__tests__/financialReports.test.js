const express = require('express');
const request = require('supertest');

jest.mock('../models/Invoice');
jest.mock('../models/CreditNote');
jest.mock('../models/GeneralExpense');
jest.mock('../models/MrExpense');
jest.mock('../middleware/authorize', () => ({
  authorize: jest.fn(() => (req, _res, next) => next())
}));

const Invoice = require('../models/Invoice');
const CreditNote = require('../models/CreditNote');
const GeneralExpense = require('../models/GeneralExpense');
const MrExpense = require('../models/MrExpense');
const router = require('../routes/finance/financialReports');

function queryResult(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('Finance management summary', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/api/finance/reports', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.find.mockImplementation(query => query.type === 'sale'
      ? queryResult([{ baseAmount: 1000, amount: 1180, cgst: 90, sgst: 90 }])
      : queryResult([{ baseAmount: 500, amount: 590, cgst: 45, sgst: 45 }]));
    CreditNote.find.mockImplementation(query => query.partyType === 'Customer'
      ? queryResult([
        { type: 'credit_note', baseAmount: 100 },
        { type: 'debit_note', baseAmount: 20 },
        { type: 'credit_note', totalAmount: 59 }
      ])
      : queryResult([{ type: 'credit_note', baseAmount: 50 }]));
    GeneralExpense.find.mockReturnValue(queryResult([{ amount: 100 }, { amount: 50 }]));
    MrExpense.find.mockReturnValue(queryResult([{ amount: 25 }]));
  });

  test('uses taxable base values and finalized credit/debit-note adjustments without treating purchases as COGS', async () => {
    const response = await request(app).get('/api/finance/reports/pnl');
    expect(response.status).toBe(200);
    expect(response.body.reportBasis).toBe('management_summary_not_accounting_profit_and_loss');
    expect(response.body.revenue).toMatchObject({
      grossTaxableValue: 1000,
      netTaxableValue: 920,
      invoicesMissingTaxableValue: 0
    });
    expect(response.body.revenue.customerCreditDebitNotes.creditNotes).toMatchObject({
      count: 2, taxableValue: 100, unquantifiedCount: 1
    });
    expect(response.body.purchases).toMatchObject({
      grossTaxableValue: 500,
      netTaxableValue: 450,
      classification: 'purchase_value_not_cost_of_goods_sold'
    });
    expect(response.body).not.toHaveProperty('cogs');
    expect(response.body).not.toHaveProperty('grossProfit');
    expect(response.body).not.toHaveProperty('netProfit');
  });

  test('includes only approved medical-representative expenses', async () => {
    const response = await request(app).get('/api/finance/reports/pnl');
    expect(response.status).toBe(200);
    expect(MrExpense.find).toHaveBeenCalledWith({ status: 'approved' });
    expect(response.body.recordedExpenses).toMatchObject({
      generalExpenseTotal: 150,
      approvedMrExpenseTotal: 25,
      total: 175
    });
  });

  test('uses an inclusive calendar end date through an exclusive next-day bound', async () => {
    const response = await request(app).get('/api/finance/reports/pnl?startDate=2026-10-01&endDate=2026-10-31');
    expect(response.status).toBe(200);
    expect(Invoice.find).toHaveBeenCalledWith({
      isFinalized: true, date: {
        $gte: new Date('2026-10-01T00:00:00.000Z'),
        $lt: new Date('2026-11-01T00:00:00.000Z')
      }, type: 'sale'
    });
    expect(MrExpense.find).toHaveBeenCalledWith({
      date: {
        $gte: new Date('2026-10-01T00:00:00.000Z'),
        $lt: new Date('2026-11-01T00:00:00.000Z')
      }, status: 'approved'
    });
  });

  test('rejects malformed, impossible and reversed date ranges before querying', async () => {
    for (const query of [
      '?startDate=2026-02-30',
      '?endDate=not-a-date',
      '?startDate=2026-11-01&endDate=2026-10-01'
    ]) {
      const response = await request(app).get(`/api/finance/reports/pnl${query}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('FINANCIAL_REPORT_DATE_RANGE_INVALID');
    }
    expect(Invoice.find).not.toHaveBeenCalled();
  });
});
