const express = require('express');
const router = express.Router();
const CertificateOfAnalysis = require('../../models/CertificateOfAnalysis');
const SystemSettings = require('../../models/SystemSettings');
const { authorize } = require('../../middleware/authorize');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

// GET /api/manufacturing/coa — List / search Certificate of Analysis documents
router.get('/', authorize('quality:view'), async (req, res) => {
  try {
    const { batchNo, status, search } = req.query;
    const filter = {};
    if (batchNo) filter.batchNo = { $regex: batchNo.trim(), $options: 'i' };
    if (status) filter.status = status;
    if (search) filter.productName = { $regex: search.trim(), $options: 'i' };

    const list = await CertificateOfAnalysis.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manufacturing/coa/:batchNo — Get CoA by Batch Number
router.get('/:batchNo', authorize('quality:view'), async (req, res) => {
  try {
    const coa = await CertificateOfAnalysis.findOne({ batchNo: req.params.batchNo }).lean();
    if (!coa) return res.status(404).json({ error: 'Certificate of Analysis not found for this batch' });
    res.json(coa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/coa — Create an evidence-backed internal draft.
router.post('/', authorize('quality:create'), async (req, res) => {
  try {
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const BatchProduction = require('../../models/BatchProduction');
    const { batchNo, productName, manufacturingDate, expiryDate, testingDate, specificationId, tests, remarks } = req.body;
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated tester identity is required' });
    if (!specificationId) return res.status(400).json({ error: 'An approved product-specific quality specification is required', code: 'COA_SPECIFICATION_REQUIRED' });
    if (!batchNo || !productName || !manufacturingDate || !expiryDate || !testingDate) return res.status(400).json({ error: 'batchNo, productName, manufacturingDate, expiryDate and testingDate are required' });
    const spec = await ProductQualitySpecification.findById(specificationId).lean();
    if (!spec || spec.status !== 'approved') return res.status(400).json({ error: 'Only an approved product-specific QC specification can be used' });
    if (!Array.isArray(spec.tests) || spec.tests.length === 0) return res.status(400).json({ error: 'The approved quality specification has no configured tests' });
    const batch = await BatchProduction.findOne({ batchNo: batchNo.trim() });
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });
    if (String(batch.productId) !== String(spec.productId)) return res.status(400).json({ error: 'QC specification does not belong to this batch product' });

    const supplied = Array.isArray(tests) ? tests : [];
    const resultTests = spec.tests.map(test => {
      const recorded = supplied.find(item => item && item.code === test.code) || {};
      const status = ['pass', 'fail', 'pending', 'not_tested'].includes(recorded.status) ? recorded.status : 'not_tested';
      const hasResult = recorded.result !== undefined && recorded.result !== null && String(recorded.result).trim() !== '';
      const testedAt = recorded.testedAt ? new Date(recorded.testedAt) : null;
      const validTimestamp = testedAt && !Number.isNaN(testedAt.getTime());
      return {
        code: test.code, name: test.name, category: test.category, mandatory: test.mandatory !== false,
        specification: test.specification, unit: test.unit, methodReference: test.methodReference,
        result: hasResult ? String(recorded.result) : '',
        numericResult: recorded.numericResult !== undefined && recorded.numericResult !== null && recorded.numericResult !== '' && Number.isFinite(Number(recorded.numericResult)) ? Number(recorded.numericResult) : null,
        status: status === 'pass' && (!hasResult || !validTimestamp) ? 'pending' : status,
        testedBy: ['pass', 'fail'].includes(status) ? req.user.id : null,
        testedByName: ['pass', 'fail'].includes(status) ? req.user.name : '',
        testedAt: validTimestamp ? testedAt : null, remarks: recorded.remarks || ''
      };
    });
    const mandatoryTests = resultTests.filter(test => test.mandatory);
    const missingTests = mandatoryTests.filter(test => !test.result || !test.testedBy || !test.testedAt || !['pass', 'fail'].includes(test.status));
    const failedTests = mandatoryTests.filter(test => test.status === 'fail');
    const allPassed = mandatoryTests.length > 0 && missingTests.length === 0 && failedTests.length === 0 && mandatoryTests.every(test => test.status === 'pass');
    const coa = await CertificateOfAnalysis.create({
      coaNumber: await generateAtomicDocumentNumber('coaNumber', 'COA-', 6),
      batchNo: batchNo.trim(), productName: productName.trim(),
      manufacturingLicenseNo: '', gmpCertificateNo: '',
      pharmacopoeialStandard: spec.pharmacopoeialStandard, specificationId: spec._id,
      specificationVersion: spec.specificationVersion, specificationSource: spec.sourceNote || spec.monographReference || '',
      dosageForm: spec.dosageForm, manufacturingDate: new Date(manufacturingDate),
      expiryDate: new Date(expiryDate), testingDate: new Date(testingDate),
      tests: resultTests, qcCompleted: missingTests.length === 0,
      overallResult: failedTests.length ? 'REJECTED' : (allPassed ? 'APPROVED' : 'PENDING'),
      status: 'draft', officialCertificate: false, documentType: 'INTERNAL_QC_RESULT_DRAFT',
      testedBy: req.user.name, remarks: remarks || ''
    });
    const response = typeof coa.toObject === 'function' ? coa.toObject() : { ...coa };
    response.evidenceComplete = missingTests.length === 0 && allPassed;
    response.missingTests = missingTests.map(test => test.code);
    return res.status(201).json(response);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/coa/:id/approve — Independent QA review of a manufacturer-issued CoA.
router.patch('/:id/approve', authorize('quality:approve'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated QA reviewer identity is required' });
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'An explicit approved or rejected disposition is required' });
    const coa = await CertificateOfAnalysis.findById(req.params.id);
    if (!coa) return res.status(404).json({ error: 'CoA not found' });
    if (coa.status !== 'draft') return res.status(409).json({ error: 'Only a draft CoA can receive a QA disposition', code: 'COA_DISPOSITION_FINALIZED' });
    if (status === 'approved') {
      const BatchProduction = require('../../models/BatchProduction');
      const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
      const batch = await BatchProduction.findOne({ batchNo: coa.batchNo });
      if (!batch || batch.status !== 'completed' || batch.qcStatus !== 'approved' || !batch.releasedBy || !batch.releasedAt) {
        return res.status(409).json({ error: 'CoA cannot be QA-approved before the linked finished-product batch has independent market release', code: 'COA_BATCH_NOT_RELEASED' });
      }
      const specification = await ProductQualitySpecification.findById(coa.specificationId).lean();
      if (!specification || specification.status !== 'approved' || String(specification.productId) !== String(batch.productId)) {
        return res.status(409).json({ error: 'The pinned product-specific QC specification is no longer approved for this batch', code: 'COA_SPECIFICATION_NOT_CURRENT' });
      }
      const mandatoryTests = (coa.tests || []).filter(test => test.mandatory !== false);
      if (!mandatoryTests.length || mandatoryTests.some(test => test.status !== 'pass' || !test.result || !test.testedAt || !test.testedBy)) {
        return res.status(400).json({ error: 'CoA cannot be approved until every mandatory QC test has a result, tester identity, timestamp and PASS disposition' });
      }
      if (mandatoryTests.some(test => String(test.testedBy) === String(req.user.id))) {
        return res.status(400).json({ error: 'Independent QA review is required; the tester cannot approve their own QC record' });
      }
      const settings = await SystemSettings.findOne().lean() || {};
      const now = new Date();
      if (!settings.manufacturingLicenseNo || !settings.gmpCertificateNo) {
        return res.status(400).json({ error: 'Manufacturing licence and GMP certificate details must be configured before CoA approval' });
      }
      if (settings.licenceValidityType === 'unknown' ||
          (settings.licenceValidityType === 'time_bound' && (!settings.licenseValidTill || new Date(settings.licenseValidTill) < now)) ||
          !settings.gmpValidTill || new Date(settings.gmpValidTill) < now) {
        return res.status(400).json({ error: 'Manufacturing licence or GMP certificate validity is missing, unknown, or expired' });
      }
      coa.manufacturingLicenseNo = settings.manufacturingLicenseNo;
      coa.gmpCertificateNo = settings.gmpCertificateNo;
      coa.officialCertificate = false;
      coa.documentType = 'MANUFACTURER_QA_APPROVED_COA';
    }
    const disposition = {
      status,
      overallResult: status === 'rejected' ? 'REJECTED' : 'APPROVED',
      qaReviewedByUser: req.user.id,
      qaReviewedByName: req.user.name,
      approvedBy: req.user.name,
      approvedAt: new Date()
    };
    if (status === 'approved') {
      disposition.manufacturingLicenseNo = coa.manufacturingLicenseNo;
      disposition.gmpCertificateNo = coa.gmpCertificateNo;
      disposition.officialCertificate = false;
      disposition.documentType = 'MANUFACTURER_QA_APPROVED_COA';
    }
    if (remarks) disposition.remarks = remarks;
    const updated = await CertificateOfAnalysis.findOneAndUpdate(
      { _id: coa._id, status: 'draft' },
      { $set: disposition },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(409).json({ error: 'CoA disposition was already finalized by another request', code: 'COA_DISPOSITION_FINALIZED' });
    return res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
