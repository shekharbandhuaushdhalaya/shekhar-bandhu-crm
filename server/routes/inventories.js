const express = require('express');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');

const router = express.Router();

// GET /api/inventories — List warehouse levels with search
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemSku: { $regex: search, $options: 'i' } },
        { warehouse: { $regex: search, $options: 'i' } },
      ];
    }

    let query = Inventory.find(filter);
    if (req.user && req.user.role === 'agent') {
      query = query.select('-val');
    }

    const items = await query.sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventories/:id — Update qty, value, and sync to product stock level
router.put('/:id', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot update inventory quantity.' });
    }
    const { qty } = req.body;
    if (qty === undefined) {
      return res.status(400).json({ error: 'Quantity (qty) is required' });
    }

    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    item.qty = qty;

    const product = await Product.findOne({ sku: item.itemSku });
    if (product) {
      item.val = qty * product.price;
      product.stockLevel = qty;
      await product.save();
    } else {
      item.val = qty * 100;
    }

    await item.save();
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
