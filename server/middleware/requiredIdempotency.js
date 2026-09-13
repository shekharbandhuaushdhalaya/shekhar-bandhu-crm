const config = require('../src/config');
const idempotency = require('./idempotency');

// Browser/mobile clients must provide a stable key for retries of mutations
// that create money, stock or logistics documents. Keep development/test
// compatibility for existing fixtures while making production fail closed.
module.exports = function requiredIdempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (config.isProduction && (!key || typeof key !== 'string' || key.trim().length < 8 || key.length > 200)) {
    return res.status(400).json({ error: 'Idempotency-Key header is required for this mutation', code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  return idempotency(req, res, next);
};
