const Counter = require('../models/Counter');

/**
 * Atomically gets the next tenant-scoped sequence number for a business counter.
 * Tenant ownership is enforced by Counter's tenant plugin and active tenant context.
 *
 * @param {string} counterId unique business counter key (e.g. `invoiceNo_SALE`)
 * @param {object|null} session optional mongoose session so number allocation can be
 * rolled back with the surrounding transaction.
 */
async function getNextSequenceValue(counterId, session = null) {
  if (!counterId || typeof counterId !== 'string') throw new Error('counterId is required');
  const options = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  const counter = await Counter.findOneAndUpdate(
    { counterKey: counterId },
    { $inc: { seq: 1 }, $setOnInsert: { counterKey: counterId } },
    options
  );
  return counter.seq;
}

async function generateAtomicDocumentNumber(counterId, prefix = '', padLength = 4, session = null) {
  const seq = await getNextSequenceValue(counterId, session);
  const padded = String(seq).padStart(padLength, '0');
  return prefix ? `${prefix}${prefix.endsWith('-') || prefix.endsWith('/') ? '' : '-'}${padded}` : padded;
}

module.exports = { getNextSequenceValue, generateAtomicDocumentNumber };
