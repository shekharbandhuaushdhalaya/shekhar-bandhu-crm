const crypto = require('crypto');
const IdempotencyKey = require('../models/IdempotencyKey');
const { getFirmId } = require('../utils/tenantContext');

module.exports = async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.trim().length < 8 || key.length > 200) return next();

  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  const firmId = getFirmId() || null;
  const scope = { firmId, key: key.trim(), method: req.method, path: req.path };
  const lookup = { ...scope };

  try {
    const existing = await IdempotencyKey.findOne(lookup).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return res.status(409).json({ error: 'Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_KEY_CONFLICT' });
      }
      if (existing.status === 'completed') return res.status(existing.statusCode || 200).json(existing.response);
      const age = Date.now() - new Date(existing.createdAt || 0).getTime();
      if (age <= 10 * 60 * 1000) {
        return res.status(409).json({ error: 'Request with this Idempotency-Key is already processing', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
      }
      await IdempotencyKey.deleteOne({ _id: existing._id });
    }

    let record;
    try {
      record = await IdempotencyKey.create({ ...scope, fingerprint, status: 'processing' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await IdempotencyKey.findOne(lookup).lean();
      if (raced && raced.fingerprint !== fingerprint) {
        return res.status(409).json({ error: 'Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_KEY_CONFLICT' });
      }
      if (raced?.status === 'completed') return res.status(raced.statusCode || 200).json(raced.response);
      return res.status(409).json({ error: 'Request with this Idempotency-Key is already processing', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
    }

    const originalJson = res.json.bind(res);
    res.json = async body => {
      await IdempotencyKey.updateOne(
        { _id: record._id },
        { $set: { status: 'completed', statusCode: res.statusCode, response: body, completedAt: new Date() } }
      );
      return originalJson(body);
    };
    return next();
  } catch (error) {
    return next(error);
  }
};
