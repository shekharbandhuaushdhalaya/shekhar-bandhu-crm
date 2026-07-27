const express = require('express');
const CustomerPricing = require('../../models/CustomerPricing');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/customer-pricing/:customerId — Get all special pricing for a customer
router.get('/:customerId', async (req, res) => {
  try {
    const pricing = await CustomerPricing.find({ customerId: req.params.customerId })
      .populate('productId', 'name sku mrp price')
      .lean();
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customer-pricing/:customerId/:productId — Set/update per-product discount override
router.put('/:customerId/:productId', async (req, res) => {
  try {
    const { discountPercent } = req.body;
    if (discountPercent === undefined || discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ error: 'discountPercent must be between 0 and 100' });
    }
    const pricing = await CustomerPricing.findOneAndUpdate(
      { customerId: req.params.customerId, productId: req.params.productId },
      { discountPercent },
      { upsert: true, new: true }
    );
    if (req.io) {
      req.io.emit('pricing_updated', { type: 'updated' });
    }
    res.json(pricing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/customer-pricing/:customerId/:productId — Remove per-product discount override
router.delete('/:customerId/:productId', async (req, res) => {
  try {
    await CustomerPricing.findOneAndDelete({ customerId: req.params.customerId, productId: req.params.productId });
    if (req.io) {
      req.io.emit('pricing_updated', { type: 'deleted' });
    }
    res.json({ message: 'Special pricing removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
