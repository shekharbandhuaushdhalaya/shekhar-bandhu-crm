const express = require('express');
const GeneralExpense = require('../../models/GeneralExpense');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/general-expenses — List general office expenses
router.get('/', authorize('report:view'), async (req, res) => {
  try {
    const { category, search, dateFrom, dateTo } = req.query;
    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (search) {
      filter.$or = [
        { expenseNo: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } }
      ];
    }
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    const expenses = await GeneralExpense.find(filter).sort({ date: -1 }).lean();

    const categorySummary = expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
      return acc;
    }, {});

    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    res.json({ expenses, totalAmount, categorySummary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/general-expenses — Record new office expense
router.post('/', authorize('payment:create'), async (req, res) => {
  try {
    const { title, category = 'other', amount, date, vendorName, paymentMode = 'bank_transfer', receiptUrl, notes } = req.body;
    if (!title || amount === undefined) {
      return res.status(400).json({ error: 'title and amount are required' });
    }

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const expenseNo = `EXP/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;

    const exp = await GeneralExpense.create({
      expenseNo,
      title,
      category,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      vendorName: vendorName || '',
      paymentMode,
      receiptUrl: receiptUrl || '',
      notes: notes || '',
      createdBy: req.user ? req.user.name : 'System'
    });

    res.status(201).json(exp);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
