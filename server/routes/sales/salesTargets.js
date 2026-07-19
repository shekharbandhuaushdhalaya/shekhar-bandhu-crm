const express = require('express');
const router = express.Router();
const SalesTarget = require('../../models/SalesTarget');
const Invoice = require('../../models/Invoice');
const User = require('../../models/User');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

// GET all targets (optionally filtered by month/year)
router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    const targets = await SalesTarget.find(filter).sort({ year: -1, month: -1 });
    res.json(targets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET commission report — aggregates sales by agentName from invoices
router.get('/commission', async (req, res) => {
  try {
    const { month, year, commissionRate } = req.query;
    const rate = parseFloat(commissionRate) || 5; // default 5%

    const filter = { type: 'sale', isFinalized: true };
    if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      filter.date = {
        $gte: new Date(y, m, 1),
        $lt: new Date(y, m + 1, 1),
      };
    }

    const invoices = await Invoice.find(filter).select('amount agentName agentId customerName date');

    // Group by agentName
    const agentMap = {};
    invoices.forEach(inv => {
      const agent = inv.agentName || inv.agentId || 'Unassigned';
      if (!agentMap[agent]) agentMap[agent] = { agentName: agent, totalSales: 0, invoiceCount: 0, commission: 0 };
      agentMap[agent].totalSales += inv.amount || 0;
      agentMap[agent].invoiceCount += 1;
    });

    const result = Object.values(agentMap).map(a => ({
      ...a,
      commission: parseFloat((a.totalSales * rate / 100).toFixed(2)),
    })).sort((a, b) => b.totalSales - a.totalSales);

    res.json({ commissionRate: rate, agents: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST set/update target (upsert)
router.post('/', validate(schemas.salesTargetSchema), async (req, res) => {
  try {
    const { agentId, agentName, month, year, targetAmount, notes } = req.body;
    const target = await SalesTarget.findOneAndUpdate(
      { agentId, month, year },
      { agentId, agentName, month, year, targetAmount, notes },
      { upsert: true, new: true }
    );
    res.status(201).json(target);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await SalesTarget.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
