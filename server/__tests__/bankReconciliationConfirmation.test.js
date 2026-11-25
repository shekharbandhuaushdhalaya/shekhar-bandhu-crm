const express = require('express');
const request = require('supertest');

jest.mock('../models/BankStatement');
jest.mock('../models/Payment');
jest.mock('../models/RolePermission');
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(work => work({ id: 'session-1' }))
}));

const BankStatement = require('../models/BankStatement');
const Payment = require('../models/Payment');
const RolePermission = require('../models/RolePermission');
const router = require('../routes/finance/bankReconciliations');

describe('Bank reconciliation confirmation', () => {
  let app;
  const statementId = '507f1f77bcf86cd799439011';
  const paymentId = '507f191e810c19729de860ea';
  const statement = {
    _id: statementId, status: 'unmatched', transactionDate: new Date('2026-11-20'),
    credit: 1000, debit: 0, reference: 'UPI-REF-1'
  };
  const payment = {
    _id: paymentId, status: 'active', type: 'receive', amount: 1000,
    date: new Date('2026-11-20'), referenceNo: 'UPI-REF-1'
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: '507f1f77bcf86cd799439099', name: 'Finance Reviewer', role: 'admin' };
      next();
    });
    app.use('/api/bank-reconciliations', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    BankStatement.findOne
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue({ ...statement }) })
      .mockReturnValueOnce({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
    Payment.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ ...payment }) });
    BankStatement.findOneAndUpdate.mockResolvedValue({
      ...statement, status: 'matched', matchedPaymentId: paymentId,
      matchedByName: 'Finance Reviewer', matchBasis: 'reference_amount_direction'
    });
  });

  test('confirms a reviewed bank match with identity, evidence and atomic state transition', async () => {
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId, reviewNotes: 'Bank reference and amount independently checked' });
    expect(response.status).toBe(200);
    expect(BankStatement.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: statementId, status: { $in: ['unmatched', 'flagged'] }, matchedPaymentId: null },
      { $set: expect.objectContaining({
        status: 'matched', matchedPaymentId: paymentId,
        matchedByUserId: '507f1f77bcf86cd799439099',
        matchedByName: 'Finance Reviewer',
        matchBasis: 'reference_amount_direction',
        matchNotes: 'Bank reference and amount independently checked',
        matchedAt: expect.any(Date)
      }) },
      { new: true, runValidators: true, session: { id: 'session-1' } }
    );
  });

  test('requires reviewer notes before confirming a match', async () => {
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('BANK_MATCH_REVIEW_EVIDENCE_REQUIRED');
    expect(BankStatement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('blocks a payment already reconciled to another bank line', async () => {
    BankStatement.findOne.mockReset()
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue({ ...statement }) })
      .mockReturnValueOnce({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'existing-match' }) }) });
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId, reviewNotes: 'Reviewed reference and amount' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYMENT_ALREADY_RECONCILED');
    expect(BankStatement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('blocks a payment that does not match bank amount or direction', async () => {
    Payment.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ ...payment, type: 'make' }) });
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId, reviewNotes: 'Reviewed bank reference and amount' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BANK_MATCH_EVIDENCE_MISMATCH');
    expect(BankStatement.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('returns a conflict when the bank line is changed before the conditional confirmation', async () => {
    BankStatement.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId, reviewNotes: 'Reviewed reference and amount before confirming' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BANK_MATCH_CONCURRENT_UPDATE');
  });

  test('translates a concurrent unique-payment match race into a stable conflict response', async () => {
    BankStatement.findOneAndUpdate.mockRejectedValue(Object.assign(
      new Error('duplicate key'),
      { code: 11000, keyPattern: { firmId: 1, matchedPaymentId: 1 } }
    ));
    const response = await request(app).patch('/api/bank-reconciliations/' + statementId + '/match')
      .send({ paymentId, reviewNotes: 'Reviewed reference and amount before confirming' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYMENT_ALREADY_RECONCILED');
    expect(response.body.error).toMatch(/concurrently/);
  });

});
