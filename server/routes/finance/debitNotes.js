const express = require('express');
const DebitNote = require('../../models/DebitNote');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// Helper: generate next Debit Note document number
async function generateDebitNoteNo() {
  const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
  const prefix = `DN/${fy}/`;
  const lastDN = await DebitNote.findOne({ debitNoteNo: { $regex: `^DN/${fy}/` } })
    .sort({ createdAt: -1 }).lean();
  let nextSeq = 1;
  if (lastDN) {
    const parts = lastDN.debitNoteNo.split('/');
    if (parts.length === 3) nextSeq = parseInt(parts[2], 10) + 1;
  }
  return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
}

// GET /api/debit-notes — List debit notes
router.get('/', authorize('invoice:view'), async (req, res) => {
  try {
    const { partyId, status, search } = req.query;
    const filter = {};
    if (partyId) filter.partyId = partyId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { debitNoteNo: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { invoiceNo: { $regex: search, $options: 'i' } }
      ];
    }

    const notes = await DebitNote.find(filter).sort({ date: -1 }).lean();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debit-notes/:id — Get debit note details
router.get('/:id', authorize('invoice:view'), async (req, res) => {
  try {
    const note = await DebitNote.findById(req.params.id).lean();
    if (!note) return res.status(404).json({ error: 'Debit note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/debit-notes — Create debit note
router.post('/', authorize('invoice:create'), async (req, res) => {
  try {
    const { partyType = 'customer', partyId, partyName, invoiceId, invoiceNo, date, items, reason, notes } = req.body;

    if (!partyId || !partyName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'partyId, partyName, and items array are required' });
    }

    let subTotal = 0;
    let taxTotal = 0;
    const processedItems = items.map(it => {
      const qty = Number(it.qty || 1);
      const rate = Number(it.rate || 0);
      const packing = Number(it.packing || 1);
      const base = qty * rate * packing;
      const gstRate = Number(it.gstRate || 0);
      const tax = (base * gstRate) / 100;
      subTotal += base;
      taxTotal += tax;
      return {
        productId: it.productId || null,
        name: it.name || 'Item Adjustment',
        size: it.size || '',
        packing,
        qty,
        rate,
        gstRate,
        amount: Number((base + tax).toFixed(2))
      };
    });

    const totalAmount = Number((subTotal + taxTotal).toFixed(2));
    const debitNoteNo = await generateDebitNoteNo();

    const dn = await DebitNote.create({
      debitNoteNo,
      partyType,
      partyId,
      partyName,
      invoiceId: invoiceId || null,
      invoiceNo: invoiceNo || '',
      date: date ? new Date(date) : new Date(),
      items: processedItems,
      subTotal: Number(subTotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      totalAmount,
      reason: reason || '',
      status: 'draft',
      createdBy: req.user ? req.user.name : 'System',
      notes: notes || ''
    });

    if (req.io) req.io.emit('debit_note_created', dn);
    res.status(201).json(dn);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/debit-notes/:id/finalize — Finalize debit note
router.patch('/:id/finalize', authorize('invoice:edit'), async (req, res) => {
  try {
    const dn = await DebitNote.findById(req.params.id);
    if (!dn) return res.status(404).json({ error: 'Debit note not found' });
    if (dn.status !== 'draft') return res.status(400).json({ error: 'Only draft debit notes can be finalized' });

    dn.status = 'finalized';
    await dn.save();

    if (req.io) req.io.emit('debit_note_updated', dn);
    res.json(dn);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/debit-notes/:id/cancel — Cancel debit note
router.patch('/:id/cancel', authorize('invoice:delete'), async (req, res) => {
  try {
    const dn = await DebitNote.findById(req.params.id);
    if (!dn) return res.status(404).json({ error: 'Debit note not found' });

    dn.status = 'cancelled';
    await dn.save();

    if (req.io) req.io.emit('debit_note_updated', dn);
    res.json(dn);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
