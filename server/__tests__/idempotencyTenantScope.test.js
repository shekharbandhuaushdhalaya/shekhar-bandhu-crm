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
    req = { headers: { 'idempotency-key': 'payment-attempt-123' }, body: { amount: 25 }, query: {}, method: 'POST', path: '/payments' };
    res = response();
    next = jest.fn();
    IdempotencyKey.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    IdempotencyKey.create = jest.fn().mockResolvedValue({ _id: 'record-1' });
    IdempotencyKey.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    IdempotencyKey.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  });

  test('scopes records by firm and persists response before sending it', async () => {
    await idempotency(req, res, next);
    expect(IdempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
      firmId: 'firm-a', key: 'payment-attempt-123', method: 'POST', path: '/payments',
      status: 'processing', fingerprint: expect.any(String)
    }));
    expect(next).toHaveBeenCalledTimes(1);
    const body = { ok: true };
    const result = await res.json(body);
    expect(result).toBe(res);
    expect(IdempotencyKey.updateOne).toHaveBeenCalledWith(
      { _id: 'record-1', status: 'processing' },
      { $set: expect.objectContaining({ status: 'completed', response: body, completedAt: expect.any(Date) }) }
    );
    expect(res.body).toEqual(body);
  });

  test('replays a completed request with the same fingerprint', async () => {
    const fingerprint = idempotency.createFingerprint(req);
    const existing = { fingerprint, status: 'completed', statusCode: 201, response: { id: 'p1' } };
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body).toEqual({ id: 'p1' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns in-progress when a concurrent insert wins with the same fingerprint', async () => {
    const fingerprint = idempotency.createFingerprint(req);
    IdempotencyKey.create.mockRejectedValueOnce({ code: 11000 });
    IdempotencyKey.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({
        _id: 'concurrent-record', fingerprint, status: 'processing'
      }) });

    await idempotency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
    expect(next).not.toHaveBeenCalled();
    expect(IdempotencyKey.create).toHaveBeenCalledTimes(1);
  });

  test('rejects reuse of a key with a different payload', async () => {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ fingerprint: 'different', status: 'completed' }) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(next).not.toHaveBeenCalled();
  });

  test('includes query parameters in the request fingerprint', () => {
    const firstFingerprint = idempotency.createFingerprint(req);
    req.query = { page: '1' };
    expect(idempotency.createFingerprint(req)).not.toBe(firstFingerprint);
  });

  test('canonicalizes object key order in request fingerprints', () => {
    const first = { ...req, body: { amount: 25, currency: 'INR' } };
    const second = { ...req, body: { currency: 'INR', amount: 25 } };
    expect(idempotency.createFingerprint(first)).toBe(idempotency.createFingerprint(second));
  });

  test('does not delete or replace an old processing record', async () => {
    IdempotencyKey.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'still-running', fingerprint: idempotency.createFingerprint(req),
      status: 'processing', createdAt: new Date(Date.now() - 60 * 60 * 1000)
    }) });
    await idempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
    expect(IdempotencyKey.deleteOne).not.toHaveBeenCalled();
    expect(IdempotencyKey.create).not.toHaveBeenCalled();
  });

  test('routes response persistence failures to Express error handling without sending success', async () => {
    const failure = new Error('database unavailable');
    IdempotencyKey.updateOne.mockRejectedValueOnce(failure);
    const originalJson = res.json;
    await idempotency(req, res, next);
    await res.json({ ok: true });
    expect(next).toHaveBeenCalledWith(failure);
    expect(originalJson).not.toHaveBeenCalledWith({ ok: true });
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
