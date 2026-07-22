const express = require('express');
const CreditNote = require('../../models/CreditNote');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

function generateNoteNo(type) {
  const prefix = type === 'credit_note' ? 'CN' : 'DN';
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

const router = express.Router();

// GET /api/credit-notes — List
router.get('/', async (req, res) => {
  try {
    const { search, type, partyType, status } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { noteNo: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } },
      ];
    }
    if (type && type !== 'all') filter.type = type;
    if (partyType && partyType !== 'all') filter.partyType = partyType;
    if (status && status !== 'all') filter.status = status;

    const notes = await CreditNote.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/credit-notes/:id
router.get('/:id', async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id).lean();
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/credit-notes — Create (draft)
router.post('/', validate(schemas.creditNoteSchema), async (req, res) => {
  try {
    const data = {
      ...req.body,
      noteNo: req.body.noteNo || generateNoteNo(req.body.type || 'credit_note'),
      status: 'draft',
    };
    const note = await CreditNote.create(data);
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/credit-notes/:id — Edit draft
router.put('/:id', async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.status !== 'draft') return res.status(400).json({ error: 'Only draft notes can be edited' });

    Object.assign(note, req.body);
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/credit-notes/:id/finalize
router.patch('/:id/finalize', async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.status !== 'draft') return res.status(400).json({ error: 'Note already finalized or cancelled' });

    // Update party balance:
    // Credit note reduces what party owes (for sales) or what we owe vendor (for purchases)
    // Debit note increases what party owes
    const amount = note.totalAmount;
    if (note.partyType === 'Customer') {
      const cust = await Customer.findById(note.partyId);
      if (cust) {
        if (note.type === 'credit_note') {
          cust.regularBalance -= amount;
        } else {
          cust.regularBalance += amount;
        }
        await cust.save();
      }
    } else if (note.partyType === 'Vendor') {
      const vend = await Vendor.findById(note.partyId);
      if (vend) {
        if (note.type === 'credit_note') {
          vend.regularBalance += amount;
        } else {
          vend.regularBalance -= amount;
        }
        await vend.save();
      }
    }

    note.status = 'finalized';
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/credit-notes/:id/cancel
router.patch('/:id/cancel', async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.status !== 'finalized') return res.status(400).json({ error: 'Only finalized notes can be cancelled' });

    // Reverse balance effect
    const amount = note.totalAmount;
    if (note.partyType === 'Customer') {
      const cust = await Customer.findById(note.partyId);
      if (cust) {
        if (note.type === 'credit_note') {
          cust.regularBalance += amount;
        } else {
          cust.regularBalance -= amount;
        }
        await cust.save();
      }
    } else if (note.partyType === 'Vendor') {
      const vend = await Vendor.findById(note.partyId);
      if (vend) {
        if (note.type === 'credit_note') {
          vend.regularBalance -= amount;
        } else {
          vend.regularBalance += amount;
        }
        await vend.save();
      }
    }

    note.status = 'cancelled';
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
