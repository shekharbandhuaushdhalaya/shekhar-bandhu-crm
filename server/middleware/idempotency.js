const crypto = require('crypto');
const IdempotencyKey = require('../models/IdempotencyKey');
const { getFirmId } = require('../utils/tenantContext');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function createFingerprint(req) {
  const request = stableValue({ body: req.body || {}, query: req.query || {} });
  return crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

function conflict(res) {
  return res.status(409).json({
    error: 'Idempotency-Key was already used for a different request',
    code: 'IDEMPOTENCY_KEY_CONFLICT'
  });
}

function inProgress(res) {
  return res.status(409).json({
    error: 'Request with this Idempotency-Key is already processing',
    code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  });
}

module.exports = async function idempotency(req, res, next) {
  const rawKey = req.headers['idempotency-key'];
  if (typeof rawKey !== 'string') return next();
  const key = rawKey.trim();
  if (key.length < 8 || key.length > 200) return next();

  const fingerprint = createFingerprint(req);
  const firmId = getFirmId() || null;
  const scope = { firmId, key, method: req.method, path: req.path };
  const lookup = { ...scope };

  try {
    const existing = await IdempotencyKey.findOne(lookup).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) return conflict(res);
      if (existing.status === 'completed') return res.status(existing.statusCode || 200).json(existing.response);
      // Processing records are never stolen based on age. A slow request may
      // still be executing a financial or inventory mutation.
      return inProgress(res);
    }

    let record;
    try {
      record = await IdempotencyKey.create({ ...scope, fingerprint, status: 'processing' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await IdempotencyKey.findOne(lookup).lean();
      if (raced && raced.fingerprint !== fingerprint) return conflict(res);
      if (raced?.status === 'completed') return res.status(raced.statusCode || 200).json(raced.response);
      return inProgress(res);
    }

    const originalJson = res.json.bind(res);
    res.json = body => Promise.resolve()
      .then(() => IdempotencyKey.updateOne(
        { _id: record._id, status: 'processing' },
        { $set: { status: 'completed', statusCode: res.statusCode, response: body, completedAt: new Date() } }
      ))
      .then(() => originalJson(body))
      .catch(error => {
        next(error);
        return res;
      });
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports.createFingerprint = createFingerprint;
