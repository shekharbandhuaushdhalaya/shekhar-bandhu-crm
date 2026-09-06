const express = require('express');
const PharmacopoeiaEntry = require('../../models/PharmacopoeiaEntry');
const { PHARMACOPOEIA_SEED_DATA } = require('../../utils/pharmacopoeiaSeedData');
const router = express.Router();

// Helper to escape special characters in regex patterns
function escapeRegex(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let isSeedSynced = false;

// Helper to ensure seed data is present in MongoDB
async function ensureSeedSynced() {
  try {
    const count = await PharmacopoeiaEntry.countDocuments();
    if (count === 0) {
      const ops = PHARMACOPOEIA_SEED_DATA.map(item => ({
        updateOne: {
          filter: { ayurvedicName: item.ayurvedicName },
          update: { $set: item },
          upsert: true
        }
      }));
      if (ops.length > 0) {
        await PharmacopoeiaEntry.bulkWrite(ops);
      }
      isSeedSynced = true;
      return;
    }

    if (!isSeedSynced) {
      if (count < PHARMACOPOEIA_SEED_DATA.length) {
        const ops = PHARMACOPOEIA_SEED_DATA.map(item => ({
          updateOne: {
            filter: { ayurvedicName: item.ayurvedicName },
            update: { $set: item },
            upsert: true
          }
        }));
        if (ops.length > 0) {
          await PharmacopoeiaEntry.bulkWrite(ops);
        }
      } else {
        const existingNames = new Set(
          (await PharmacopoeiaEntry.find({}, 'ayurvedicName').lean()).map(e => e.ayurvedicName)
        );
        const missingSeeds = PHARMACOPOEIA_SEED_DATA.filter(item => !existingNames.has(item.ayurvedicName));
        if (missingSeeds.length > 0) {
          const ops = missingSeeds.map(item => ({
            updateOne: {
              filter: { ayurvedicName: item.ayurvedicName },
              update: { $set: item },
              upsert: true
            }
          }));
          await PharmacopoeiaEntry.bulkWrite(ops);
        }
      }
      isSeedSynced = true;
    }
  } catch (err) {
    console.error('Error syncing pharmacopoeia seed data:', err.message);
  }
}

// GET /api/pharmacopoeia — List / Search pharmacopoeia monographs
router.get('/', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300');
    await ensureSeedSynced();

    const { search, q, standard, page, limit, all } = req.query;
    const queryTerm = (search || q || '').trim();

    const filter = {};
    if (queryTerm) {
      const escaped = escapeRegex(queryTerm);
      filter.$or = [
        { ayurvedicName: { $regex: escaped, $options: 'i' } },
        { botanicalName: { $regex: escaped, $options: 'i' } },
        { synonyms: { $regex: escaped, $options: 'i' } },
        { family: { $regex: escaped, $options: 'i' } }
      ];
    }
    if (standard && standard !== 'all') {
      filter.pharmacopoeialStandard = standard;
    }

    let query = PharmacopoeiaEntry.find(filter).sort({ ayurvedicName: 1 });
    if (all !== 'true' && limit !== 'all') {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 50);
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const entries = await query.lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pharmacopoeia/search — Instant search by herb name or alias
router.get('/search', async (req, res) => {
  try {
    await ensureSeedSynced();
    const queryTerm = (req.query.q || req.query.query || '').trim();
    if (!queryTerm) return res.status(400).json({ error: 'Search query parameter q is required' });

    const escaped = escapeRegex(queryTerm);
    let entries = await PharmacopoeiaEntry.find({
      $or: [
        { ayurvedicName: { $regex: escaped, $options: 'i' } },
        { botanicalName: { $regex: escaped, $options: 'i' } },
        { synonyms: { $regex: escaped, $options: 'i' } }
      ]
    }).limit(10).lean();

    // If not found in local pre-seeded database, query global 10,000+ botanical taxonomy engine (GBIF + AI)
    if (entries.length === 0 && queryTerm.length >= 3) {
      const { resolveHerbDetails } = require('../../utils/botanicalLookup');
      const resolved = await resolveHerbDetails(queryTerm);
      if (resolved && (resolved.scientificName || resolved.matchedName)) {
        const searchRegex = new RegExp(`^${escapeRegex(resolved.matchedName)}$`, 'i');
        let existing = await PharmacopoeiaEntry.findOne({
          $or: [
            { ayurvedicName: searchRegex },
            { botanicalName: { $regex: new RegExp(`^${escapeRegex(resolved.scientificName || resolved.botanicalName)}$`, 'i') } }
          ]
        }).lean();

        if (existing) {
          entries = [existing];
        } else {
          try {
            const newDoc = await PharmacopoeiaEntry.create({
              ayurvedicName: resolved.matchedName.toUpperCase(),
              botanicalName: resolved.scientificName || resolved.botanicalName || queryTerm.toUpperCase(),
              family: resolved.family || '',
              partUsed: resolved.partUsed || 'Whole Plant / Material',
              pharmacopoeialStandard: resolved.pharmacopoeialStandard || 'API',
              monographRef: resolved.monographRef || `API / Botanical Standard (${resolved.source || 'Taxonomy Registry'})`,
              synonyms: resolved.synonyms || [],
              description: resolved.description || `Medicinal plant entry dynamically resolved for ${queryTerm}.`
            });
            entries = [newDoc.toObject ? newDoc.toObject() : newDoc];
          } catch (createErr) {
            existing = await PharmacopoeiaEntry.findOne({ ayurvedicName: searchRegex }).lean();
            if (existing) entries = [existing];
          }
        }
      }
    }

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pharmacopoeia/seed — Trigger manual re-seeding / reset
router.post('/seed', async (req, res) => {
  try {
    await PharmacopoeiaEntry.deleteMany({});
    const inserted = await PharmacopoeiaEntry.insertMany(PHARMACOPOEIA_SEED_DATA);
    res.json({ message: `Successfully seeded ${inserted.length} monographs into Pharmacopoeia Dictionary`, count: inserted.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pharmacopoeia/import-to-raw-materials — Bulk/single import monographs into Raw Materials Master
router.post('/import-to-raw-materials', async (req, res) => {
  try {
    const RawMaterial = require('../../models/RawMaterial');
    const { generateRawMaterialSku } = require('../../utils/skuGenerator');
    const { monographId, importAll } = req.body;
    let itemsToImport = [];

    if (monographId) {
      const entry = await PharmacopoeiaEntry.findById(monographId).lean();
      if (!entry) return res.status(404).json({ error: 'Monograph entry not found' });
      itemsToImport.push(entry);
    } else if (importAll) {
      await ensureSeedSynced();
      itemsToImport = await PharmacopoeiaEntry.find({}).lean();
    } else {
      return res.status(400).json({ error: 'Specify monographId or importAll: true' });
    }

    let createdCount = 0;
    let skippedCount = 0;
    const createdItems = [];

    for (const item of itemsToImport) {
      const formattedName = (item.ayurvedicName || item.botanicalName).trim().toUpperCase();
      const existing = await RawMaterial.findOne({ name: formattedName }).lean();
      if (existing) {
        skippedCount++;
        continue;
      }

      let computedSku = generateRawMaterialSku(formattedName);
      let conflict = await RawMaterial.findOne({ sku: computedSku }).lean();
      let counter = 1;
      while (conflict) {
        computedSku = `${generateRawMaterialSku(formattedName)}-${counter}`;
        conflict = await RawMaterial.findOne({ sku: computedSku }).lean();
        counter++;
      }

      const newRM = await RawMaterial.create({
        name: formattedName,
        sku: computedSku,
        unit: 'kg',
        category: item.category || 'Dry Herb',
        botanicalName: item.botanicalName || '',
        partUsed: item.partUsed || '',
        pharmacopoeialStandard: item.pharmacopoeialStandard || 'API',
        monographRef: item.monographRef || '',
        isScheduleE1: item.isScheduleE1 || false,
        stockLevel: 0
      });
      createdItems.push(newRM);
      createdCount++;
    }

    res.json({
      message: `Imported ${createdCount} Ayurvedic ingredients into Raw Materials Master (${skippedCount} already existed).`,
      importedCount: createdCount,
      skippedCount,
      createdItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pharmacopoeia/:id — Get monograph details by ID
router.get('/:id', async (req, res) => {
  try {
    const entry = await PharmacopoeiaEntry.findById(req.params.id).lean();
    if (!entry) return res.status(404).json({ error: 'Monograph not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pharmacopoeia — Create custom pharmacopoeia entry
router.post('/', async (req, res) => {
  try {
    const { ayurvedicName, botanicalName } = req.body;
    if (!ayurvedicName || !botanicalName) {
      return res.status(400).json({ error: 'ayurvedicName and botanicalName are required' });
    }
    const entry = await PharmacopoeiaEntry.create(req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/pharmacopoeia/:id — Update pharmacopoeia entry
router.put('/:id', async (req, res) => {
  try {
    const updated = await PharmacopoeiaEntry.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Monograph not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
