const express = require('express');
const CreditNote = require('../../models/CreditNote');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const Invoice = require('../../models/Invoice');
const SalesReturn = require('../../models/SalesReturn');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { withTransaction } = require('../../utils/withTransaction');

async function generateNoteNo(type, session = null) {
  const prefix = type === 'credit_note' ? 'CN' : 'DN';
  return generateAtomicDocumentNumber(`noteNo_${prefix}`, `${prefix}-`, 6, session);
}

function money(value) { return Number(Number(value || 0).toFixed(2)); }

async function resolvePartyAndInvoice(note, session) {
  const isCustomer = note.partyType === 'Customer';
  const party = isCustomer
    ? await Customer.findById(note.partyId).session(session)
    : await Vendor.findById(note.partyId).session(session);
  if (!party) throw Object.assign(new Error(`${note.partyType} not found`), { status: 404, code: 'PARTY_NOT_FOUND' });

  let invoice = null;
  if (note.invoiceId) {
    invoice = await Invoice.findById(note.invoiceId).session(session);
    if (!invoice || !invoice.isFinalized) throw Object.assign(new Error('Linked finalized invoice not found'), { status: 409, code: 'INVOICE_NOT_FINALIZED' });
    if (isCustomer && (invoice.type !== 'sale' || String(invoice.customerId || '') !== String(party._id))) {
      throw Object.assign(new Error('Credit/debit note customer does not match the linked Sale Invoice'), { status: 409, code: 'PARTY_INVOICE_MISMATCH' });
    }
    if (!isCustomer && (invoice.type !== 'purchase' || String(invoice.vendorId || '') !== String(party._id))) {
      throw Object.assign(new Error('Credit/debit note vendor does not match the linked Purchase Invoice'), { status: 409, code: 'PARTY_INVOICE_MISMATCH' });
    }
    note.invoiceNo = invoice.invoiceNo || note.invoiceNo || '';
  }
  return { party, invoice, isCustomer };
}

function balanceFieldFor(isCustomer, invoice) {
  if (!isCustomer) return 'regularBalance';
  return invoice?.mode === 'cash' ? 'cashBalance' : 'regularBalance';
}

async function applyNoteBalance(note, direction, session) {
  const { party, invoice, isCustomer } = await resolvePartyAndInvoice(note, session);
  const field = balanceFieldFor(isCustomer, invoice);
  const amount = money(note.totalAmount);
  const noteDelta = note.type === 'credit_note' ? -amount : amount;
  party[field] = money(Number(party[field] || 0) + noteDelta * direction);
  await party.save({ session });
}

const router = express.Router();

router.get('/', authorize('invoice:view'), async (req, res) => {
  try {
    const { search, type, partyType, status } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { noteNo: { $regex: search, $options: 'i' } },
      { partyName: { $regex: search, $options: 'i' } },
      { invoiceNo: { $regex: search, $options: 'i' } },
    ];
    if (type && type !== 'all') filter.type = type;
    if (partyType && partyType !== 'all') filter.partyType = partyType;
    if (status && status !== 'all') filter.status = status;
    res.json(await CreditNote.find(filter).sort({ date: -1, createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authorize('invoice:view'), async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id).lean();
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('invoice:create'), validate(schemas.creditNoteSchema), async (req, res) => {
  try {
    const type = req.body.type || 'credit_note';
    const data = { ...req.body, noteNo: req.body.noteNo || await generateNoteNo(type), type, status: 'draft' };
    const note = await CreditNote.create(data);
    if (req.io) req.io.emit('credit_note_updated', { type: 'created', id: note._id });
    res.status(201).json(note);
  } catch (err) { res.status(400).json({ error: err.message, code: err.code }); }
});

router.put('/:id', authorize('invoice:edit'), async (req, res) => {
  try {
    const note = await CreditNote.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.status !== 'draft') return res.status(409).json({ error: 'Only draft notes can be edited' });
    const protectedFields = ['noteNo', 'status'];
    for (const field of protectedFields) delete req.body[field];
    Object.assign(note, req.body);
    await note.save();
    if (req.io) req.io.emit('credit_note_updated', { type: 'updated', id: note._id });
    res.json(note);
  } catch (err) { res.status(400).json({ error: err.message, code: err.code }); }
});

router.patch('/:id/finalize', authorize('invoice:finalize'), async (req, res) => {
  try {
    const note = await withTransaction(async session => {
      const locked = await CreditNote.findById(req.params.id).session(session);
      if (!locked) throw Object.assign(new Error('Note not found'), { status: 404, code: 'NOTE_NOT_FOUND' });
      if (locked.status !== 'draft') throw Object.assign(new Error('Only draft notes can be finalized'), { status: 409, code: 'NOTE_NOT_DRAFT' });
      if (!(Number(locked.totalAmount || 0) > 0)) throw Object.assign(new Error('Note amount must be greater than zero'), { status: 400, code: 'INVALID_NOTE_AMOUNT' });
      await applyNoteBalance(locked, 1, session);
      locked.status = 'finalized';
      await locked.save({ session });
      return locked;
    });
    if (req.io) req.io.emit('credit_note_updated', { type: 'finalized', id: note._id });
    res.json(note);
  } catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code }); }
});

router.patch('/:id/cancel', authorize('invoice:delete'), async (req, res) => {
  try {
    const linkedReturn = await SalesReturn.exists({ creditNoteId: req.params.id, status: { $in: ['posted', 'reversed'] } });
    if (linkedReturn) return res.status(409).json({ error: 'This credit note is controlled by a Sales Return. Reverse the Sales Return instead.', code: 'SALES_RETURN_CONTROLS_NOTE' });
    const note = await withTransaction(async session => {
      const locked = await CreditNote.findById(req.params.id).session(session);
      if (!locked) throw Object.assign(new Error('Note not found'), { status: 404, code: 'NOTE_NOT_FOUND' });
      if (locked.status !== 'finalized') throw Object.assign(new Error('Only finalized notes can be cancelled'), { status: 409, code: 'NOTE_NOT_FINALIZED' });
      await applyNoteBalance(locked, -1, session);
      locked.status = 'cancelled';
      await locked.save({ session });
      return locked;
    });
    if (req.io) req.io.emit('credit_note_updated', { type: 'cancelled', id: note._id });
    res.json(note);
  } catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code }); }
});

module.exports = router;
