const express = require('express');
const router = express.Router();
const Complaint = require('../../models/Complaint');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

// Auto-generate complaint number
async function nextComplaintNo() {
  const last = await Complaint.findOne().sort({ createdAt: -1 }).select('complaintNo');
  if (!last || !last.complaintNo) return 'CMP-001';
  const num = parseInt(last.complaintNo.replace(/\D/g, ''), 10) || 0;
  return `CMP-${String(num + 1).padStart(3, '0')}`;
}

// GET all complaints
router.get('/', async (req, res) => {
  try {
    const { status, type, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;
    if (search) filter.$or = [
      { customerName: new RegExp(search, 'i') },
      { complaintNo: new RegExp(search, 'i') },
      { invoiceNo: new RegExp(search, 'i') },
    ];
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create
router.post('/', validate(schemas.complaintSchema), async (req, res) => {
  try {
    const complaintNo = await nextComplaintNo();
    const complaint = await Complaint.create({ ...req.body, complaintNo });
    if (req.io) {
      req.io.emit('complaint_updated', { type: 'created', id: complaint._id });
    }
    res.status(201).json(complaint);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update status / resolve
router.patch('/:id', validate(schemas.complaintSchema.partial()), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.status === 'resolved' && !data.resolvedAt) data.resolvedAt = new Date();
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (req.io) {
      req.io.emit('complaint_updated', { type: 'updated', id: complaint._id });
    }
    res.json(complaint);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Complaint.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
