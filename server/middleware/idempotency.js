const crypto = require('crypto');
const IdempotencyKey = require('../models/IdempotencyKey');
const { getFirmId } = require('../utils/tenantContext');
module.exports = async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.length > 200) return next();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  const firmId = getFirmId();
  const scope = { firmId: firmId || null, key, method: req.method, path: req.path, fingerprint };
  try {
    const existing = await IdempotencyKey.findOne(scope).lean();
    if (existing?.status === 'completed') return res.status(existing.statusCode || 200).json(existing.response);
    if (existing?.status === 'processing') {
      const age = Date.now() - new Date(existing.createdAt || 0).getTime();
      if (age > 10 * 60 * 1000) {
        await IdempotencyKey.deleteOne({ _id: existing._id });
      } else {
        return res.status(409).json({ error: 'Request with this Idempotency-Key is already processing', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
      }
    }
    await IdempotencyKey.create({ ...scope, status: 'processing' });
    const originalJson = res.json.bind(res);
    res.json = async body => { await IdempotencyKey.updateOne(scope, { $set: { status: 'completed', statusCode: res.statusCode, response: body, completedAt: new Date() } }); return originalJson(body); };
    next();
  } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'Duplicate Idempotency-Key', code: 'IDEMPOTENCY_KEY_CONFLICT' }); next(err); }
};
