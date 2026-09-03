const Counter = require('../models/Counter');

/**
 * Atomically gets the next sequence number for a given counter ID.
 * @param {string} counterId - Unique key for the counter (e.g. 'invoiceNo', 'complaintNo', 'sampleNo', 'dispatchNo')
 * @returns {Promise<number>} - Next sequence number
 */
async function getNextSequenceValue(counterId) {
  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

/**
 * Atomically generates a formatted document number code.
 * @param {string} counterId - Unique counter identifier
 * @param {string} prefix - Optional prefix (e.g. 'VP', 'DISP', 'CMP')
 * @param {number} padLength - Number of digits to zero-pad (default: 4)
 * @returns {Promise<string>} - Formatted document code (e.g. 'VP-0042' or '0042')
 */
async function generateAtomicDocumentNumber(counterId, prefix = '', padLength = 4) {
  const seq = await getNextSequenceValue(counterId);
  const padded = String(seq).padStart(padLength, '0');
  return prefix ? `${prefix}-${padded}` : padded;
}

module.exports = {
  getNextSequenceValue,
  generateAtomicDocumentNumber
};
