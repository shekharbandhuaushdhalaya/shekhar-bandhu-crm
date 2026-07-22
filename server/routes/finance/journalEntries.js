const express = require('express');
const JournalEntry = require('../../models/JournalEntry');

const router = express.Router();

function generateEntryNo() {
  return `JE-${Date.now().toString().slice(-6)}`;
}

// GET /api/journal-entries
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { entryNo: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const entries = await JournalEntry.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal-entries/:id
router.get('/:id', async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id).lean();
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/journal-entries — Create draft
router.post('/', async (req, res) => {
  try {
    const { lines } = req.body;
    if (!lines || lines.length < 2) {
      return res.status(400).json({ error: 'Journal entry must have at least 2 lines' });
    }

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: 'Total debits must equal total credits' });
    }

    const data = {
      ...req.body,
      entryNo: req.body.entryNo || generateEntryNo(),
      status: 'draft',
    };
    const entry = await JournalEntry.create(data);
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/journal-entries/:id — Edit draft
router.put('/:id', async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.status !== 'draft') return res.status(400).json({ error: 'Only draft entries can be edited' });

    const { lines } = req.body;
    if (lines && lines.length >= 2) {
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ error: 'Total debits must equal total credits' });
      }
    }

    Object.assign(entry, req.body);
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/journal-entries/:id/post — Post entry
router.patch('/:id/post', async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.status !== 'draft') return res.status(400).json({ error: 'Entry already posted or cancelled' });

    entry.status = 'posted';
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/journal-entries/:id
router.delete('/:id', async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.status === 'posted') return res.status(400).json({ error: 'Posted entries cannot be deleted. Create a reversing entry.' });

    await JournalEntry.findByIdAndDelete(req.params.id);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
