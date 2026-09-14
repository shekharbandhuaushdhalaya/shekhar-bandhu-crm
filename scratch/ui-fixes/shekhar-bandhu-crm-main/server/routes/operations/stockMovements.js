const express = require('express');
const StockMovement = require('../../models/StockMovement');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// StockMovement is a historical compatibility collection. New physical movements are
// handled by dedicated authoritative workflows: Sale/Transfer Challans, Production,
// MR Samples, Inventory Compliance write-offs, GRNs and Sales Returns.
router.get('/', authorize('stockmovement:view'), async (req, res) => {
  try {
    const { direction, type, status, search, startDate, endDate } = req.query;
    const filter = {};
    if (direction) filter.direction = direction;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (search) filter.$or = [{ docNo: { $regex: search, $options: 'i' } }, { partyName: { $regex: search, $options: 'i' } }];
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); filter.date.$lte = d; }
    }
    res.json(await StockMovement.find(filter).sort({ createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authorize('stockmovement:view'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id).lean();
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    res.json(movement);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const retired = (_req, res) => res.status(410).json({
  error: 'Legacy StockMovement writes are retired. Use the dedicated inventory, Challan, sample, transfer, production, return, or compliance workflow.',
  code: 'LEGACY_STOCK_MOVEMENT_RETIRED'
});
router.post('/', authorize('stockmovement:create'), retired);
router.put('/:id', authorize('stockmovement:edit'), retired);
router.patch('/:id/dispatch', authorize('stockmovement:edit'), retired);
router.patch('/:id/receive', authorize('stockmovement:edit'), retired);
router.patch('/:id/cancel', authorize('stockmovement:delete'), retired);
router.delete('/:id', authorize('stockmovement:delete'), retired);
router.post('/:id/convert-to-invoice', authorize('stockmovement:edit'), retired);

module.exports = router;
