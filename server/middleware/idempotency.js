const crypto = require('crypto');
const IdempotencyKey = require('../models/IdempotencyKey');
module.exports = async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.length > 200) return next();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  try {
    const existing = await IdempotencyKey.findOne({ key, method: req.method, path: req.path, fingerprint }).lean();
    if (existing?.status === 'completed') return res.status(existing.statusCode || 200).json(existing.response);
    if (existing?.status === 'processing') return res.status(409).json({ error: 'Request with this Idempotency-Key is already processing' });
    await IdempotencyKey.create({ key, method: req.method, path: req.path, fingerprint, status: 'processing' });
    const originalJson = res.json.bind(res);
    res.json = async body => { await IdempotencyKey.updateOne({ key, method: req.method, path: req.path, fingerprint }, { $set: { status: 'completed', statusCode: res.statusCode, response: body, completedAt: new Date() } }); return originalJson(body); };
    next();
  } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'Duplicate Idempotency-Key' }); next(err); }
};
