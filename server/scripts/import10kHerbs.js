/**
 * Import medicinal plant taxonomy records into one explicitly selected tenant.
 *
 * Usage:
 *   IMPORT_FIRM_ID=<firm ObjectId> MONGODB_URI=<uri> node server/scripts/import10kHerbs.js [--file=dataset.json]
 * Production additionally requires IMPORT_HERBS_CONFIRM=YES.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

const SAMPLE_RECORDS = [
  { ayurvedicName: 'LATAKARANJA', botanicalName: 'Caesalpinia bonduc (L.) Roxb.', partUsed: 'Seed (Beej)', pharmacopoeialStandard: 'API', monographRef: 'API Part I, Vol I, Page 73', synonyms: ['Karanju', 'Fever Nut', 'Bonduc Nut'] },
  { ayurvedicName: 'VAJRAVALLI', botanicalName: 'Cissus quadrangularis L.', partUsed: 'Stem (Kanda)', pharmacopoeialStandard: 'API', monographRef: 'API Part I, Vol III, Page 61', synonyms: ['Hadjod', 'Bone Setter', 'Asthisamharaka'] },
  { ayurvedicName: 'JIVANTI', botanicalName: 'Leptadenia reticulata (Retz.) Wight & Arn.', partUsed: 'Root / Whole Plant', pharmacopoeialStandard: 'API', monographRef: 'API Part I, Vol IV, Page 35', synonyms: ['Dodee', 'Jeevanti'] },
  { ayurvedicName: 'PASHANABHEDA', botanicalName: 'Bergenia ligulata (Wall.) Engl.', partUsed: 'Rhizome (Mool)', pharmacopoeialStandard: 'API', monographRef: 'API Part I, Vol I, Page 89', synonyms: ['Pakhanbhed', 'Rock Foil'] }
];

function validateRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('The import dataset must be a non-empty JSON array.');
  }
  records.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Dataset record ${index + 1} must be an object.`);
    }
    const botanicalName = String(item.botanicalName || item.scientificName || '').trim();
    const ayurvedicName = String(item.ayurvedicName || item.commonName || botanicalName).trim();
    if (!botanicalName || !ayurvedicName) {
      throw new Error(`Dataset record ${index + 1} requires ayurvedicName (or commonName) and botanicalName (or scientificName).`);
    }
  });
  return records;
}

async function importHerbs(filePath, env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required; refusing to use a default database.');
  if (env.NODE_ENV === 'production' && env.IMPORT_HERBS_CONFIRM !== 'YES') {
    throw new Error('Production herb import requires IMPORT_HERBS_CONFIRM=YES.');
  }

  const firmId = String(env.IMPORT_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('IMPORT_FIRM_ID must be a valid MongoDB ObjectId to scope the import to one firm.');
  }

  let records = SAMPLE_RECORDS;
  if (filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      throw new Error('The specified dataset file does not exist or is not a file.');
    }
    records = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  }
  validateRecords(records);

  await mongoose.connect(mongoUri);
  try {
    const firm = await Firm.findById(firmId).select('_id').lean();
    if (!firm) throw new Error('IMPORT_FIRM_ID does not match an existing firm.');

    const operations = records.map(item => {
      const botanicalName = String(item.botanicalName || item.scientificName).trim();
      const ayurvedicName = String(item.ayurvedicName || item.commonName || botanicalName).trim().toUpperCase();
      const synonyms = Array.isArray(item.synonyms)
        ? item.synonyms
        : (item.synonyms ? String(item.synonyms).split(',') : []);
      return {
        updateOne: {
          filter: { ayurvedicName },
          update: {
            $set: {
              ayurvedicName,
              botanicalName,
              family: item.family || '',
              partUsed: item.partUsed || 'Whole Plant / Material',
              pharmacopoeialStandard: item.pharmacopoeialStandard || 'API',
              monographRef: item.monographRef || 'API / Indian Botanical Taxonomy',
              synonyms: synonyms.map(value => String(value).trim()).filter(Boolean),
              description: item.description || `Medicinal plant entry for ${ayurvedicName}.`
            }
          },
          upsert: true
        }
      };
    });

    const result = await runWithTenant({ firmId: firm._id }, () => PharmacopoeiaEntry.bulkWrite(operations));
    console.log(`Herb import completed for firm ${firmId}: matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}.`);
    return result;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const fileArg = process.argv.slice(2).find(arg => arg.startsWith('--file='));
  const filePath = fileArg ? fileArg.slice('--file='.length) : null;
  importHerbs(filePath).catch(error => {
    console.error('Herb import failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { importHerbs, validateRecords };
