const express = require('express');
const router = express.Router();
const RawMaterialQuarantine = require('../../models/RawMaterialQuarantine');
const { authorize } = require('../../middleware/authorize');

// GET /api/manufacturing/quarantine — List raw material quarantine lots
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { status, herbName, search } = req.query;
    const filter = {};
    if (status) filter.quarantineStatus = status;
    if (herbName) filter.herbName = { $regex: herbName.trim(), $options: 'i' };
    if (search) filter.$or = [
      { herbName: { $regex: search.trim(), $options: 'i' } },
      { batchNo: { $regex: search.trim(), $options: 'i' } },
      { botanicalName: { $regex: search.trim(), $options: 'i' } },
    ];

    const list = await RawMaterialQuarantine.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manufacturing/quarantine/near-expiry — Get raw materials nearing expiration date (within <= 60 days)
router.get('/near-expiry', authorize('inventory:view'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 60;
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const items = await RawMaterialQuarantine.find({
      quarantineStatus: 'released',
      expiryDate: { $gte: now, $lte: cutoff }
    }).sort({ expiryDate: 1 }).lean();

    const result = items.map(item => {
      const msLeft = new Date(item.expiryDate).getTime() - now.getTime();
      const daysToExpiry = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      return {
        ...item,
        daysToExpiry,
        isNearExpiry: daysToExpiry <= 60,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/quarantine — Log new botanical raw material into quarantine
router.post('/', authorize('inventory:create'), async (req, res) => {
  try {
    const { herbName, botanicalName, batchNo, supplierName, qty, unit, expiryDate } = req.body;

    if (!herbName || !batchNo || !qty || !expiryDate) {
      return res.status(400).json({ error: 'herbName, batchNo, qty, and expiryDate are required' });
    }

    const quarantineLotNo = `QRM-${Date.now().toString().slice(-8)}`;

    const lot = await RawMaterialQuarantine.create({
      quarantineLotNo,
      herbName,
      botanicalName: botanicalName || '',
      batchNo,
      supplierName: supplierName || 'Herbal Vendor',
      qty: parseFloat(qty),
      unit: unit || 'kg',
      expiryDate: new Date(expiryDate),
      quarantineStatus: 'under_testing',
      receivedDate: new Date()
    });

    res.status(201).json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/quarantine/:id/release — Quality release or rejection of quarantine lot
router.patch('/:id/release', authorize('quality:approve'), async (req, res) => {
  try {
    const { quarantineStatus, testReportNo, remarks } = req.body;
    if (!['released', 'rejected'].includes(quarantineStatus)) {
      return res.status(400).json({ error: 'quarantineStatus must be "released" or "rejected"' });
    }

    const lot = await RawMaterialQuarantine.findById(req.params.id);
    if (!lot) return res.status(404).json({ error: 'Quarantine lot not found' });

    lot.quarantineStatus = quarantineStatus;
    lot.testReportNo = testReportNo || `QC-${Date.now().toString().slice(-6)}`;
    lot.testingDate = new Date();
    lot.testedBy = req.user ? req.user.name : 'QC Chemist';
    lot.releasedBy = req.user ? req.user.name : 'QC Head';
    if (remarks) lot.remarks = remarks;

    await lot.save();
    res.json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
