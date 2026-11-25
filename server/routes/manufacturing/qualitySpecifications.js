const express = require('express');
const router = express.Router();
const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
const { authorize } = require('../../middleware/authorize');

router.get('/', authorize('quality:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.query.status) filter.status = req.query.status;
    res.json(await ProductQualitySpecification.find(filter).populate('productId', 'name sku size').sort({ effectiveDate: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('quality:create'), async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!actorId || !actorName) return res.status(401).json({ error: 'Authenticated specification author identity is required' });
    const { productId, systemOfMedicine, dosageForm, pharmacopoeialStandard, monographReference, specificationVersion, effectiveDate, tests, sourceNote } = req.body || {};
    for (const [field, value] of Object.entries({ productId, dosageForm, pharmacopoeialStandard, specificationVersion })) {
      if (value === undefined || value === null || String(value).trim() === '') return res.status(400).json({ error: field + ' is required' });
    }
    if (!Array.isArray(tests) || tests.length === 0) return res.status(400).json({ error: 'At least one product-specific QC test is required' });
    const seen = new Set();
    for (const test of tests) {
      const code = String(test?.code || '').trim().toUpperCase();
      if (!code || !String(test?.name || '').trim() || !String(test?.specification || '').trim()) {
        return res.status(400).json({ error: 'Each test requires a unique code, name and specification' });
      }
      if (seen.has(code)) return res.status(400).json({ error: 'Duplicate QC test code: ' + code });
      seen.add(code);
    }
    if (!tests.some(test => test.mandatory !== false)) return res.status(400).json({ error: 'At least one mandatory QC test is required' });
    const effective = effectiveDate === undefined ? new Date() : new Date(effectiveDate);
    if (Number.isNaN(effective.getTime())) return res.status(400).json({ error: 'effectiveDate must be a valid date' });
    const spec = await ProductQualitySpecification.create({
      productId, systemOfMedicine, dosageForm: String(dosageForm).trim(),
      pharmacopoeialStandard: String(pharmacopoeialStandard).trim(),
      monographReference, specificationVersion: String(specificationVersion).trim(),
      effectiveDate: effective, tests: tests.map(test => ({
        code: String(test.code).trim().toUpperCase(), name: String(test.name).trim(),
        category: test.category, specification: String(test.specification).trim(),
        unit: test.unit || '', methodReference: test.methodReference || '',
        mandatory: test.mandatory !== false
      })),
      sourceNote: typeof sourceNote === 'string' ? sourceNote.trim() : '',
      status: 'draft', createdByUserId: actorId, createdByName: actorName,
      approvedBy: null, approvedByName: '', approvedAt: null
    });
    res.status(201).json(spec);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/approve', authorize('quality:approve'), async (req, res) => {
  try {
    const spec = await ProductQualitySpecification.findById(req.params.id);
    if (!spec) return res.status(404).json({ error: 'Specification not found' });
    const reviewerId = req.user?.id || req.user?._id;
    const reviewerName = req.user?.name || req.user?.email;
    if (!reviewerId || !reviewerName) return res.status(401).json({ error: 'Authenticated QA approver identity is required' });
    if (spec.status !== 'draft') return res.status(409).json({ error: 'Only draft quality specifications can be approved' });
    if (spec.createdByUserId && String(spec.createdByUserId) === String(reviewerId)) {
      return res.status(409).json({ error: 'The specification author cannot approve their own specification' });
    }
    const tests = Array.isArray(spec.tests) ? spec.tests : [];
    const codes = tests.map(test => String(test.code || '').trim().toUpperCase());
    if (!tests.length || !tests.some(test => test.mandatory !== false) || codes.some(code => !code) || new Set(codes).size !== codes.length) {
      return res.status(409).json({ error: 'Specification requires unique test codes and at least one mandatory test before approval' });
    }
    if (tests.some(test => !String(test.name || '').trim() || !String(test.specification || '').trim())) {
      return res.status(409).json({ error: 'Every specification test requires a name and approved acceptance specification' });
    }
    spec.status = 'approved';
    spec.approvedBy = reviewerId;
    spec.approvedByName = reviewerName;
    spec.approvedAt = new Date();
    await spec.save();
    res.json(spec);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
