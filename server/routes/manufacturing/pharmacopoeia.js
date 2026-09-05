const express = require('express');
const PharmacopoeiaEntry = require('../../models/PharmacopoeiaEntry');
const { PHARMACOPOEIA_SEED_DATA } = require('../../utils/pharmacopoeiaSeedData');
const router = express.Router();

// Helper to sync/upsert seed defaults into MongoDB
async function syncPharmacopoeiaSeedData() {
  try {
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
  } catch (err) {
    console.error('Error syncing pharmacopoeia seed data:', err.message);
  }
}

// GET /api/pharmacopoeia — List / Search pharmacopoeia monographs
router.get('/', async (req, res) => {
  try {
    await syncPharmacopoeiaSeedData();

    const { search, q, standard } = req.query;
    const queryTerm = (search || q || '').trim();

    const filter = {};
    if (queryTerm) {
      filter.$or = [
        { ayurvedicName: { $regex: queryTerm, $options: 'i' } },
        { botanicalName: { $regex: queryTerm, $options: 'i' } },
        { synonyms: { $regex: queryTerm, $options: 'i' } },
        { family: { $regex: queryTerm, $options: 'i' } }
      ];
    }
    if (standard && standard !== 'all') {
      filter.pharmacopoeialStandard = standard;
    }

    const entries = await PharmacopoeiaEntry.find(filter).sort({ ayurvedicName: 1 }).lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pharmacopoeia/search — Instant search by herb name or alias
router.get('/search', async (req, res) => {
  try {
    await syncPharmacopoeiaSeedData();
    const queryTerm = (req.query.q || req.query.query || '').trim();
    if (!queryTerm) return res.status(400).json({ error: 'Search query parameter q is required' });

    let entries = await PharmacopoeiaEntry.find({
      $or: [
        { ayurvedicName: { $regex: queryTerm, $options: 'i' } },
        { botanicalName: { $regex: queryTerm, $options: 'i' } },
        { synonyms: { $regex: queryTerm, $options: 'i' } }
      ]
    }).limit(10).lean();

    // If not found in local pre-seeded database, query global 10,000+ botanical taxonomy engine (GBIF + AI)
    if (entries.length === 0 && queryTerm.length >= 3) {
      const { resolveHerbDetails } = require('../../utils/botanicalLookup');
      const resolved = await resolveHerbDetails(queryTerm);
      if (resolved && (resolved.scientificName || resolved.matchedName)) {
        const newEntry = await PharmacopoeiaEntry.findOneAndUpdate(
          { ayurvedicName: resolved.matchedName },
          {
            ayurvedicName: resolved.matchedName,
            botanicalName: resolved.scientificName || resolved.botanicalName || queryTerm.toUpperCase(),
            family: resolved.family || '',
            partUsed: resolved.partUsed || 'Whole Plant / Material',
            pharmacopoeialStandard: resolved.pharmacopoeialStandard || 'API',
            monographRef: resolved.monographRef || `API / Botanical Standard (${resolved.source || 'Taxonomy Registry'})`,
            synonyms: resolved.synonyms || [],
            description: resolved.description || `Medicinal plant entry dynamically resolved for ${queryTerm}.`
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        if (newEntry) {
          entries = [newEntry];
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
      await syncPharmacopoeiaSeedData();
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
