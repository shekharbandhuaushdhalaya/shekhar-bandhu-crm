require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const IdempotencyKey = require('../models/IdempotencyKey');

(async () => {
  await mongoose.connect(config.mongoUri);
  const collection = IdempotencyKey.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find(index => index.name === 'key_1_method_1_path_1_fingerprint_1');
  if (legacy) await collection.dropIndex(legacy.name);
  await collection.createIndex(
    { firmId: 1, key: 1, method: 1, path: 1 },
    { unique: true, name: 'firmId_1_key_1_method_1_path_1_unique' }
  );
  console.log('Idempotency index is tenant-scoped and fingerprint-independent.');
  await mongoose.disconnect();
})().catch(async error => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
