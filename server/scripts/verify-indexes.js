require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const fs = require('fs');
const path = require('path');
const { compareIndexes } = require('../utils/indexVerification');

async function verifyIndexes() {
  await mongoose.connect(config.mongoUri);
  try {
    for (const file of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
      if (file.endsWith('.js')) require(path.join(__dirname, '..', 'models', file));
    }

    const failures = [];
    const modelNames = mongoose.modelNames();
    for (const name of modelNames) {
      const Model = mongoose.model(name);
      const expected = Model.schema.indexes();
      const actual = await Model.collection.indexes();
      const comparison = compareIndexes(expected, actual);
      if (comparison.missing.length || comparison.mismatched.length) {
        failures.push({ model: name, ...comparison });
      }
    }

    const result = { ok: failures.length === 0, models: modelNames.length, failures };
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, models: modelNames.length }));
    }
    return result;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  verifyIndexes().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { verifyIndexes };
