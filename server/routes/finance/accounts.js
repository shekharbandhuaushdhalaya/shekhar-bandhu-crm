const express = require('express');
const Account = require('../../models/Account');
const JournalEntry = require('../../models/JournalEntry');

const router = express.Router();

// GET /api/accounts — List chart of accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find().sort({ code: 1 }).lean();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts — Create account
router.post('/', async (req, res) => {
  try {
    const account = await Account.create(req.body);
    res.status(201).json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    await Account.findByIdAndDelete(req.params.id);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/trial-balance
router.get('/trial-balance', async (req, res) => {
  try {
    const { asOf } = req.query;
    const dateFilter = asOf ? { date: { $lte: new Date(asOf) } } : {};

    const entries = await JournalEntry.find({ ...dateFilter, status: 'posted' }).lean();

    const balances = {};
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (!balances[line.accountCode]) {
          balances[line.accountCode] = { name: line.accountName, debit: 0, credit: 0 };
        }
        balances[line.accountCode].debit += line.debit;
        balances[line.accountCode].credit += line.credit;
      }
    }

    const rows = Object.entries(balances).map(([code, b]) => ({
      code,
      name: b.name,
      debit: b.debit,
      credit: b.credit,
      balance: b.debit - b.credit,
    }));

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

    res.json({ rows, totalDebit, totalCredit, asOf: asOf || new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/profit-loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), 3, 1);
    const end = to ? new Date(to) : new Date();

    const entries = await JournalEntry.find({
      date: { $gte: start, $lte: end },
      status: 'posted',
    }).lean();

    const income = [];
    const expenses = [];

    for (const entry of entries) {
      for (const line of entry.lines) {
        const account = await Account.findById(line.accountId).lean();
        if (!account) continue;
        if (account.type === 'income') {
          const existing = income.find(i => i.code === line.accountCode);
          if (existing) {
            existing.amount += line.credit - line.debit;
          } else {
            income.push({ code: line.accountCode, name: line.accountName, amount: line.credit - line.debit });
          }
        } else if (account.type === 'expense') {
          const existing = expenses.find(e => e.code === line.accountCode);
          if (existing) {
            existing.amount += line.debit - line.credit;
          } else {
            expenses.push({ code: line.accountCode, name: line.accountName, amount: line.debit - line.credit });
          }
        }
      }
    }

    const totalIncome = income.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    res.json({
      from: start.toISOString(),
      to: end.toISOString(),
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/balance-sheet
router.get('/balance-sheet', async (req, res) => {
  try {
    const { asOf } = req.query;
    const date = asOf ? new Date(asOf) : new Date();

    const entries = await JournalEntry.find({ date: { $lte: date }, status: 'posted' }).lean();

    const balances = {};
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (!balances[line.accountCode]) {
          balances[line.accountCode] = {
            name: line.accountName,
            accountId: line.accountId,
            debit: 0,
            credit: 0,
          };
        }
        balances[line.accountCode].debit += line.debit;
        balances[line.accountCode].credit += line.credit;
      }
    }

    const assets = [];
    const liabilities = [];
    const equity = [];

    for (const [code, b] of Object.entries(balances)) {
      const account = await Account.findById(b.accountId).lean();
      if (!account) continue;
      const balance = b.debit - b.credit;
      if (account.type === 'asset') {
        assets.push({ code, name: b.name, balance });
      } else if (account.type === 'liability') {
        liabilities.push({ code, name: b.name, balance });
      } else if (account.type === 'equity') {
        equity.push({ code, name: b.name, balance });
      }
    }

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

    res.json({
      asOf: date.toISOString(),
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesEquity: totalLiabilities + totalEquity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
