const express = require('express');
const router = express.Router();
const Complaint = require('../../models/Complaint');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

// Auto-generate complaint number atomically
async function nextComplaintNo() {
  return generateAtomicDocumentNumber('complaintNo', 'CMP', 3);
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

// GET /api/complaints/batch-clusters — List batch complaint clusters (batches with 2+ complaints)
router.get('/batch-clusters', async (req, res) => {
  try {
    const clusters = await Complaint.aggregate([
      { $match: { batchNo: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$batchNo',
          complaintCount: { $sum: 1 },
          productName: { $first: '$productName' },
          lastComplaintDate: { $max: '$createdAt' },
          complaints: { $push: { id: '$_id', complaintNo: '$complaintNo', customerName: '$customerName', description: '$description' } },
          autoCapaTriggered: { $max: '$autoCapaTriggered' }
        }
      },
      { $match: { complaintCount: { $gte: 2 } } },
      { $sort: { complaintCount: -1 } }
    ]);
    res.json(clusters);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create complaint
router.post('/', validate(schemas.complaintSchema), async (req, res) => {
  try {
    const complaintNo = await nextComplaintNo();
    const complaintData = { ...req.body, complaintNo };
    const complaint = await Complaint.create(complaintData);

    // Option 1: Check for Complaint Cluster on same batchNo
    if (complaint.batchNo) {
      const batchNoClean = complaint.batchNo.trim();
      const existingCount = await Complaint.countDocuments({ batchNo: batchNoClean });

      if (existingCount >= 2) {
        const DeviationCapa = require('../../models/DeviationCapa');
        let capa = await DeviationCapa.findOne({ batchNo: batchNoClean, deviationType: 'customer_complaint_cluster' });
        
        if (!capa) {
          const capaNo = `CAPA-CMP-${Date.now().toString().slice(-6)}`;
          capa = await DeviationCapa.create({
            deviationNo: capaNo,
            batchNo: batchNoClean,
            batchId: complaint.batchId || null,
            deviationType: 'customer_complaint_cluster',
            description: `Customer Complaint Cluster Alert: ${existingCount} customer complaints reported on Batch ${batchNoClean} (${complaint.productName || 'Product'}).`,
            reportedBy: 'QA Auto Audit System',
            status: 'open'
          });
        }

        complaint.autoCapaTriggered = true;
        complaint.capaId = capa._id;
        await complaint.save();

        if (req.io) {
          req.io.emit('quality_alert', {
            type: 'customer_complaint_cluster',
            batchNo: batchNoClean,
            complaintCount: existingCount,
            capaNo: capa.deviationNo
          });
        }
      }
    }

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
