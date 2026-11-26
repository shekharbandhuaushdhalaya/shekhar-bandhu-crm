jest.mock('../models/IdempotencyKey');
jest.mock('../utils/tenantContext', () => ({ getFirmId: jest.fn(() => 'firm-a') }));

const IdempotencyKey = require('../models/IdempotencyKey');
const { getFirmId } = require('../utils/tenantContext');
const idempotency = require('../middleware/idempotency');

function response() {
  const res = { statusCode: 200, status: jest.fn(function (code) { this.statusCode = code; return this; }), json: jest.fn(function (body) { this.body = body; return this; }) };
  return res;
}

describe('tenant-scoped idempotency', () => {
  let req, res, next;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: { 'idempotency-key': 'payment-attempt-123' }, body: { amount: 25 }, method: 'POST', path: '/payments' };
    res = response();
    next = jest.fn();
    IdempotencyKey.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    IdempotencyKey.create = jest.fn().mockResolvedValue({ _id: 'record-1' });
    IdempotencyKey.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    IdempotencyKey.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  });

  test('scopes unique records by firm and does not include the fingerprint in the uniqueness scope', async () => {
    await idempotency(req, res, next);
    expect(IdempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
      firmId: 'firm-a', key: 'payment-attempt-123', method: 'POST', path: '/payments',
      status: 'processing', fingerprint: expect.any(String)
    }));
    expect(next).toHaveBeenCalledTimes(1);
    await res.json({ ok: true });
    expect(IdempotencyKey.updateOne).toHaveBeenCalledWith(
      { _id: 'record-1' }, expect.objectContaining({ $set: expect.objectContaining({ status: 'completed', response: { ok: true } }) })
    );
  });

  test('replays a completed request with the same fingerprint', async () => {
    const existing = { fingerprint: require('crypto').createHash('sha256').update(JSON.stringify(req.body)).digest('hex'), status: 'completed', statusCode: 201, response: { id: 'p1' } };
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body).toEqual({ id: 'p1' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects reuse of a key with a different payload', async () => {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ fingerprint: 'different', status: 'completed' }) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(next).not.toHaveBeenCalled();
  });

  test('recovers a concurrent duplicate-key insert as in-progress or conflict', async () => {
    IdempotencyKey.create.mockRejectedValueOnce({ code: 11000 });
    IdempotencyKey.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ fingerprint: 'different', status: 'processing' }) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  test('skips persistence for absent keys and preserves tenant lookup context', async () => {
    req.headers = {};
    await idempotency(req, res, next);
    expect(getFirmId).not.toHaveBeenCalled();
    expect(IdempotencyKey.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
