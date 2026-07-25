const mongoose = require('mongoose');

/**
 * Executes a function inside a MongoDB Transaction.
 * Automatically falls back to standard execution if the database is running in stand-alone mode.
 * @param {Function} fn - The function to execute inside the transaction block. Receives the mongoose session object.
 */
async function runWithTransaction(fn) {
  const conn = mongoose.connection;
  
  // Check if connection description indicates ReplicaSet or Sharded configuration
  const isReplicaSet = conn.client && conn.client.topology && 
    (conn.client.topology.description.type.includes('ReplicaSet') || 
     conn.client.topology.description.type === 'Sharded');
     
  if (!isReplicaSet) {
    return await fn(null);
  }
  
  const session = await conn.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = { runWithTransaction };
