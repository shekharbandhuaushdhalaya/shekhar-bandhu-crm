const express = require('express');
const StabilityStudy = require('../../models/StabilityStudy');
const Product = require('../../models/Product');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/stability-studies — List stability studies
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { productId, studyType, status } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (studyType) filter.studyType = studyType;
    if (status) filter.status = status;

    const list = await StabilityStudy.find(filter)
      .populate('productId', 'name sku')
      .populate('batchId', 'batchNo')
      .sort({ createdAt: -1 })
      .lean();

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stability-studies — Create stability study
router.post('/', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { productId, batchId, studyType, durationMonthsStudied, grantedShelfLifeYears, reportRef, notes } = req.body;

    if (!productId || !studyType || !durationMonthsStudied || !grantedShelfLifeYears) {
      return res.status(400).json({ error: 'productId, studyType, durationMonthsStudied, and grantedShelfLifeYears are required' });
    }

    const prod = await Product.findById(productId);
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    let realTimeFollowUpDueBy = null;
    if (studyType === 'accelerated') {
      const now = new Date();
      // grantedShelfLifeYears + 1 year for real-time report filing deadline
      realTimeFollowUpDueBy = new Date(now.getTime() + (Number(grantedShelfLifeYears) + 1) * 365 * 24 * 60 * 60 * 1000);
    }

    const study = await StabilityStudy.create({
      productId,
      batchId: batchId || null,
      studyType,
      durationMonthsStudied: Number(durationMonthsStudied),
      grantedShelfLifeYears: Number(grantedShelfLifeYears),
      reportRef: reportRef || '',
      realTimeFollowUpDueBy,
      notes: notes || '',
      status: 'open'
    });

    res.status(201).json(study);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/stability-studies/:id/follow-up — Link real-time follow-up study
router.patch('/:id/follow-up', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { realTimeFollowUpStudyId, reportSubmittedAt } = req.body;

    const study = await StabilityStudy.findById(req.params.id);
    if (!study) return res.status(404).json({ error: 'Stability study not found' });

    study.realTimeFollowUpStudyId = realTimeFollowUpStudyId || null;
    study.submittedToLicensingAuthority = true;
    study.reportSubmittedAt = reportSubmittedAt ? new Date(reportSubmittedAt) : new Date();
    study.status = 'closed';

    await study.save();
    res.json(study);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
