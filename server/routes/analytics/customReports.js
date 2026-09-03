const express = require('express');
const Invoice = require('../../models/Invoice');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// POST /api/analytics/custom-reports/query — Dynamic custom report builder query engine
router.post('/query', authorize('report:view'), async (req, res) => {
  try {
    const { collection = 'invoices', groupBy = 'customerName', dateFrom, dateTo } = req.body;

    if (collection === 'invoices') {
      const filter = { type: 'sale', isFinalized: true };
      if (dateFrom || dateTo) {
        filter.date = {};
        if (dateFrom) filter.date.$gte = new Date(dateFrom);
        if (dateTo) filter.date.$lte = new Date(dateTo);
      }

      const raw = await Invoice.find(filter).lean();
      const groupedMap = new Map();

      raw.forEach(inv => {
        const key = inv[groupBy] || 'Unassigned';
        const amt = inv.nettTotal || inv.amount || 0;
        if (!groupedMap.has(key)) {
          groupedMap.set(key, { groupKey: key, count: 0, totalAmount: 0 });
        }
        const item = groupedMap.get(key);
        item.count++;
        item.totalAmount += amt;
      });

      const results = Array.from(groupedMap.values()).map(r => ({
        ...r,
        totalAmount: Number(r.totalAmount.toFixed(2))
      })).sort((a, b) => b.totalAmount - a.totalAmount);

      return res.json({ collection, groupBy, totalRecords: results.length, data: results });
    }

    if (collection === 'products') {
      const prods = await Product.find({}).lean();
      const results = prods.map(p => ({
        groupKey: p.category || 'General',
        name: p.name,
        stockLevel: p.stockLevel,
        price: p.price
      }));
      return res.json({ collection, totalRecords: results.length, data: results });
    }

    res.status(400).json({ error: `Unsupported report collection: ${collection}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
