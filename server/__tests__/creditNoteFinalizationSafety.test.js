const express = require('express');
const request = require('supertest');

jest.mock('../models/CreditNote');
jest.mock('../models/Customer');
jest.mock('../models/Vendor');
jest.mock('../models/Invoice');
jest.mock('../models/SalesReturn');
jest.mock('../middleware/authorize', () => ({ authorize: () => (_req, _res, next) => next() }));
jest.mock('../middleware/validate', () => ({ validate: () => (_req, _res, next) => next() }));
jest.mock('../validation/schemas', () => ({ creditNoteSchema: {} }));
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn() }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(fn => fn(null)) }));

const CreditNote = require('../models/CreditNote');
const Customer = require('../models/Customer');
const router = require('../routes/finance/creditNotes');

describe('Credit/debit note finalization accounting safeguards', () => {
  let app;
  let note;
  let customer;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'reviewer-1', name: 'Finance Reviewer' };
      next();
    });
    app.use('/api/credit-notes', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    customer = { _id: 'customer-1', regularBalance: 500, save: jest.fn().mockResolvedValue(true) };
    note = {
      _id: 'note-1',
      status: 'draft',
      type: 'credit_note',
      partyType: 'Customer',
      partyId: 'customer-1',
      partyName: 'Customer',
      reason: 'Commercial rate correction',
      baseAmount: 100,
      cgst: 9,
      sgst: 9,
      igst: 0,
      totalAmount: 118,
      save: jest.fn().mockResolvedValue(true)
    };
    CreditNote.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue(note) }));
    Customer.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue(customer) }));
  });

  test('rejects a note whose total does not reconcile to taxable base and GST', async () => {
    note.totalAmount = 120;
    const response = await request(app).patch('/api/credit-notes/note-1/finalize');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NOTE_TOTAL_MISMATCH');
    expect(customer.save).not.toHaveBeenCalled();
    expect(note.save).not.toHaveBeenCalled();
  });

  test('rejects an invalid interstate and intrastate tax split', async () => {
    note.igst = 18;
    const response = await request(app).patch('/api/credit-notes/note-1/finalize');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_NOTE_TAX_SPLIT');
    expect(customer.save).not.toHaveBeenCalled();
  });

  test('rejects a note without substantive reason evidence', async () => {
    note.reason = 'Correction';
    const response = await request(app).patch('/api/credit-notes/note-1/finalize');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NOTE_REASON_REQUIRED');
    expect(customer.save).not.toHaveBeenCalled();
  });

  test('posts a reconciled note and customer balance together', async () => {
    const response = await request(app).patch('/api/credit-notes/note-1/finalize');
    expect(response.status).toBe(200);
    expect(customer.regularBalance).toBe(382);
    expect(customer.save).toHaveBeenCalled();
    expect(note.status).toBe('finalized');
    expect(note.save).toHaveBeenCalled();
  });
});
