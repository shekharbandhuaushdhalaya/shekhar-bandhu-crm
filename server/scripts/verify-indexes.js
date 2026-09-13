require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const fs = require('fs');
const path = require('path');

(async () => {
  await mongoose.connect(config.mongoUri);
  for (const file of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
    if (file.endsWith('.js')) require(path.join(__dirname, '..', 'models', file));
  }
  const failures = [];
  for (const name of mongoose.modelNames()) {
    const Model = mongoose.model(name);
    const expected = Model.schema.indexes().map(([keys]) => JSON.stringify(keys));
    const actual = (await Model.collection.indexes()).map(index => JSON.stringify(index.key));
    const missing = expected.filter(index => !actual.includes(index));
    if (missing.length) failures.push({ model: name, missing });
  }
  await mongoose.disconnect();
  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, models: mongoose.modelNames().length }));
})().catch(async error => { console.error(error.stack || error.message); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
