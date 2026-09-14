const express = require('express');
const RetentionSample = require('../../models/RetentionSample');
const BatchProduction = require('../../models/BatchProduction');
const Product = require('../../models/Product');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/retention-samples — List reference/retention samples
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { status, batchId, dueForDisposal } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (batchId) filter.batchId = batchId;

    if (dueForDisposal === 'true') {
      filter.retentionUntil = { $lte: new Date() };
      filter.status = 'stored';
    }

    const list = await RetentionSample.find(filter).sort({ retentionUntil: 1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retention-samples — Log new retention sample
router.post('/', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { batchId, qtyRetained, unit = 'units', storageLocation, retentionUntil } = req.body;
    if (!batchId || !qtyRetained || qtyRetained <= 0) {
      return res.status(400).json({ error: 'batchId and positive qtyRetained are required' });
    }

    const batch = await BatchProduction.findById(batchId).populate('productId');
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    let finalRetentionUntil = retentionUntil ? new Date(retentionUntil) : null;
    if (!finalRetentionUntil) {
      const baseDate = batch.expiryDate ? new Date(batch.expiryDate) : (batch.mfgDate ? new Date(batch.mfgDate.getTime() + (batch.shelfLifeMonths || 36) * 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000));
      finalRetentionUntil = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000); // expiryDate + 1 year
    }

    const sample = await RetentionSample.create({
      batchId: batch._id,
      batchNo: batch.batchNo,
      productId: batch.productId._id || batch.productId,
      productName: batch.productId.name || 'Product',
      qtyRetained: Number(qtyRetained),
      unit,
      storageLocation: storageLocation || 'QC Retention Shelf A',
      retainedBy: req.user ? req.user.id : null,
      retainedByName: req.user ? req.user.name : 'QC Chemist',
      retainedAt: new Date(),
      retentionUntil: finalRetentionUntil,
      status: 'stored'
    });

    if (req.io) {
      req.io.emit('retention_sample_updated', { type: 'created', id: sample._id });
    }

    res.status(201).json(sample);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/retention-samples/due-for-disposal — List samples reaching 3-year expiration/disposal date
router.get('/due-for-disposal', authorize('manufacturing:view'), async (req, res) => {
  try {
    const dueList = await RetentionSample.find({
      retentionUntil: { $lte: new Date() },
      status: 'stored'
    }).sort({ retentionUntil: 1 }).lean();
    res.json(dueList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/retention-samples/:id/dispose — Mark reference sample as disposed with method & witness
router.patch('/:id/dispose', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { disposalNotes, disposalMethod = 'autoclaving', witnessedBy = '', status = 'disposed' } = req.body;

    const sample = await RetentionSample.findById(req.params.id);
    if (!sample) return res.status(404).json({ error: 'Retention sample record not found' });

    sample.status = status;
    sample.disposedAt = new Date();
    sample.disposedBy = req.user ? req.user.id : null;
    sample.disposalNotes = `Method: ${disposalMethod}. Witness: ${witnessedBy || 'QC Officer'}. ${disposalNotes || ''}`.trim();

    await sample.save();

    if (req.io) {
      req.io.emit('retention_sample_updated', { type: 'disposed', id: sample._id });
    }

    res.json(sample);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
