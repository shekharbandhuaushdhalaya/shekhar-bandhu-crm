const express = require('express');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const { validate } = require('../../middleware/validate');
const { z } = require('zod');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ name: 1 }).lean();
    const entries = await InventoryEntry.find({}).lean();

    const inventoryMap = {};
    entries.forEach(entry => {
      const qty = Number(entry.qtyBoxes) || 0;
      const packing = Number(entry.packing) || 1;
      const units = qty * packing;
      const prodId = entry.productId ? entry.productId.toString() : '';
      if (prodId) {
        inventoryMap[prodId] = (inventoryMap[prodId] || 0) + units;
      }
    });

    const enriched = products.map(p => {
      const prodId = p._id.toString();
      return {
        ...p,
        inventoryQty: inventoryMap[prodId] || 0,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const entries = await InventoryEntry.find({ productId: product._id }).lean();
    const totalUnits = entries.reduce((acc, entry) => {
      const qty = Number(entry.qtyBoxes) || 0;
      const packing = Number(entry.packing) || 1;
      return acc + (qty * packing);
    }, 0);

    const variants = await Product.find({
      name: { $regex: new RegExp(`^${product.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
    }).lean();

    const allEntries = await InventoryEntry.find({ productId: { $in: variants.map(v => v._id) } }).lean();
    const invMap = {};
    allEntries.forEach(entry => {
      const q = Number(entry.qtyBoxes) || 0;
      const p = Number(entry.packing) || 1;
      const pid = entry.productId.toString();
      invMap[pid] = (invMap[pid] || 0) + (q * p);
    });

    const enrichedVariants = variants.map(v => ({
      ...v,
      inventoryQty: invMap[v._id.toString()] || 0
    })).sort((a, b) => a.price - b.price);

    res.json({
      ...product,
      inventoryQty: totalUnits,
      variants: enrichedVariants
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/rate', validate(z.object({ rating: z.number().min(1).max(5) })), async (req, res) => {
  try {
    const { rating } = req.body;
    const val = Number(rating);
    if (isNaN(val) || val < 1 || val > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentCount = product.ratingCount || 0;
    const currentAvg = product.rating || 0;
    const newCount = currentCount + 1;
    const newAvg = ((currentAvg * currentCount) + val) / newCount;

    product.rating = Math.round(newAvg * 10) / 10;
    product.ratingCount = newCount;
    await product.save();

    res.json({ rating: product.rating, ratingCount: product.ratingCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
