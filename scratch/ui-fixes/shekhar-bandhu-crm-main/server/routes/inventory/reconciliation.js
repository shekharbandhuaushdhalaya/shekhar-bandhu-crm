const express = require('express');
const { authorize } = require('../../middleware/authorize');
const { reconcileInventory } = require('../../utils/inventoryReconciliation');

const router = express.Router();

// Read-only inventory integrity report. Never repairs data automatically.
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { warehouseId, productId, limit = 500 } = req.query;
    const report = await reconcileInventory({ warehouseId, productId, limit: Math.min(2000, Math.max(1, Number(limit) || 500)) });
    res.json(report);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 'INVENTORY_RECONCILIATION_FAILED' });
  }
});

module.exports = router;
