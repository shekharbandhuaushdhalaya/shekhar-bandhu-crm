jest.mock('../src/config', () => ({ isProduction: true }));
jest.mock('../middleware/idempotency', () => jest.fn((req, res, next) => next()));

const config = require('../src/config');
const idempotency = require('../middleware/idempotency');
const requiredIdempotency = require('../middleware/requiredIdempotency');

describe('required idempotency middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    config.isProduction = true;
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    idempotency.mockClear();
  });

  test('rejects missing or too-short keys in production', () => {
    requiredIdempotency(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
    expect(idempotency).not.toHaveBeenCalled();
  });

  test('delegates a valid production key to the idempotency handler', () => {
    req.headers['idempotency-key'] = 'payment-retry-123';
    requiredIdempotency(req, res, next);
    expect(idempotency).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('preserves development compatibility when no key is supplied', () => {
    config.isProduction = false;
    requiredIdempotency(req, res, next);
    expect(idempotency).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
