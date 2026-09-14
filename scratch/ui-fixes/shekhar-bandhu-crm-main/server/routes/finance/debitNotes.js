const express = require('express');
const DebitNote = require('../../models/DebitNote');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// Historical read-only endpoint. New credit/debit adjustments use /api/credit-notes,
// whose unified model is the source used by GST returns and customer/vendor balances.
router.get('/', authorize('invoice:view'), async (req, res) => {
  try {
    const { partyId, status, search } = req.query;
    const filter = {};
    if (partyId) filter.partyId = partyId;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { debitNoteNo: { $regex: search, $options: 'i' } },
      { partyName: { $regex: search, $options: 'i' } },
      { invoiceNo: { $regex: search, $options: 'i' } },
    ];
    res.json(await DebitNote.find(filter).sort({ date: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authorize('invoice:view'), async (req, res) => {
  try {
    const note = await DebitNote.findById(req.params.id).lean();
    if (!note) return res.status(404).json({ error: 'Debit note not found' });
    res.json(note);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function retired(_req, res) {
  return res.status(410).json({
    error: 'The legacy Debit Note workflow is read-only. Create debit adjustments from Credit / Debit Notes.',
    code: 'LEGACY_DEBIT_NOTE_RETIRED',
  });
}
router.post('/', authorize('invoice:create'), retired);
router.put('/:id', authorize('invoice:edit'), retired);
router.patch('/:id/finalize', authorize('invoice:edit'), retired);
router.patch('/:id/cancel', authorize('invoice:delete'), retired);
router.delete('/:id', authorize('invoice:delete'), retired);

module.exports = router;
