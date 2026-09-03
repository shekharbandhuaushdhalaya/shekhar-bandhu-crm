const express = require('express');
const SampleConversion = require('../../models/SampleConversion');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/sample-conversions — List sample-to-prescription conversion records
router.get('/', authorize('mr:view'), async (req, res) => {
  try {
    const { mrId, doctorId, status } = req.query;
    const filter = {};
    if (mrId) filter.mrId = mrId;
    if (doctorId) filter.doctorId = doctorId;
    if (status) filter.conversionStatus = status;

    const records = await SampleConversion.find(filter).sort({ givenDate: -1 }).lean();

    const totalSamplesGiven = records.reduce((sum, r) => sum + r.samplesQtyGiven, 0);
    const convertedRecords = records.filter(r => r.conversionStatus === 'converted');
    const totalPrescriptionRevenue = convertedRecords.reduce((sum, r) => sum + r.prescriptionOrderAmount, 0);
    const conversionRatePercent = records.length > 0 ? Number(((convertedRecords.length / records.length) * 100).toFixed(1)) : 0;

    res.json({
      records,
      totalSamplesGiven,
      totalConverted: convertedRecords.length,
      conversionRatePercent,
      totalPrescriptionRevenue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sample-conversions — Record sample distribution to doctor
router.post('/', authorize('mr:create'), async (req, res) => {
  try {
    const { mrId, mrName, doctorId, doctorName, productId, productName, samplesQtyGiven } = req.body;
    if (!mrId || !doctorId || !productId || !samplesQtyGiven) {
      return res.status(400).json({ error: 'mrId, doctorId, productId, and samplesQtyGiven are required' });
    }

    const rec = await SampleConversion.create({
      mrId,
      mrName: mrName || 'Medical Rep',
      doctorId,
      doctorName: doctorName || 'Doctor',
      productId,
      productName: productName || 'Sample Product',
      samplesQtyGiven: Number(samplesQtyGiven),
      givenDate: new Date(),
      conversionStatus: 'pending'
    });

    res.status(201).json(rec);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/sample-conversions/:id/convert — Mark sample converted with resulting prescription invoice amount
router.patch('/:id/convert', authorize('mr:edit'), async (req, res) => {
  try {
    const { resultingInvoiceId, prescriptionOrderAmount } = req.body;
    const rec = await SampleConversion.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Sample record not found' });

    rec.conversionStatus = 'converted';
    rec.resultingInvoiceId = resultingInvoiceId || null;
    rec.prescriptionOrderAmount = Number(prescriptionOrderAmount || 0);
    rec.convertedAt = new Date();

    await rec.save();
    res.json(rec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
