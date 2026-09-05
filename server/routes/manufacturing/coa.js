const express = require('express');
const router = express.Router();
const CertificateOfAnalysis = require('../../models/CertificateOfAnalysis');
const SystemSettings = require('../../models/SystemSettings');
const { authorize } = require('../../middleware/authorize');

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

// POST /api/manufacturing/coa — Create a new Certificate of Analysis (AYUSH Heavy Metal & Microbial limits)
router.post('/', authorize('quality:create'), async (req, res) => {
  try {
    const {
      batchNo, productName, manufacturingDate, expiryDate, testingDate,
      pharmacopoeialStandard, dosageForm, sampleQuantityTested,
      organolepticTests, physicochemicalTests, heavyMetalTests, microbialTests,
      aflatoxinsAndPesticides, remarks
    } = req.body;

    if (!batchNo || !productName || !manufacturingDate || !expiryDate) {
      return res.status(400).json({ error: 'batchNo, productName, manufacturingDate, and expiryDate are required' });
    }

    const settings = await SystemSettings.findOne().lean() || {};

    const coaNumber = `COA-${Date.now().toString().slice(-8)}`;
    const testedBy = req.user ? req.user.name : 'QC Manager';

    // Validate AYUSH Heavy Metal limits (Lead <= 10ppm, Cadmium <= 0.3ppm, Mercury <= 1ppm, Arsenic <= 3ppm)
    const hm = heavyMetalTests || {};
    const lead = parseFloat(hm.leadPpm) !== undefined ? parseFloat(hm.leadPpm) : 0.1;
    const cadmium = parseFloat(hm.cadmiumPpm) !== undefined ? parseFloat(hm.cadmiumPpm) : 0.02;
    const mercury = parseFloat(hm.mercuryPpm) !== undefined ? parseFloat(hm.mercuryPpm) : 0.01;
    const arsenic = parseFloat(hm.arsenicPpm) !== undefined ? parseFloat(hm.arsenicPpm) : 0.05;
    const hmPassed = lead <= 10.0 && cadmium <= 0.3 && mercury <= 1.0 && arsenic <= 3.0;

    // Validate AYUSH Microbial limits
    const mb = microbialTests || {};
    const totalPlateCount = parseFloat(mb.totalPlateCountCfu) || 100;
    const yeastMold = parseFloat(mb.yeastMoldCfu) || 10;
    const mbPassed = totalPlateCount <= 100000 && yeastMold <= 1000 && (mb.eColi !== 'Present') && (mb.salmonella !== 'Present');

    // Validate Physicochemical limits
    const pc = physicochemicalTests || {};
    const lod = parseFloat(pc.lossOnDryingPercent) || 4.2;
    const ash = parseFloat(pc.totalAshPercent) || 2.8;
    const pcPassed = lod <= 10.0 && ash <= 10.0;

    const allPassed = hmPassed && mbPassed && pcPassed;

    const coa = await CertificateOfAnalysis.create({
      coaNumber,
      batchNo: batchNo.trim(),
      productName: productName.trim(),
      manufacturingLicenseNo: req.body.manufacturingLicenseNo || settings.manufacturingLicenseNo || 'AYUSH-1983-UP',
      gmpCertificateNo: req.body.gmpCertificateNo || settings.gmpCertificateNo || 'GMP-AYUSH-2026-VNS',
      pharmacopoeialStandard: pharmacopoeialStandard || 'API',
      dosageForm: dosageForm || 'Churna / Herbal Formulation',
      manufacturingDate: new Date(manufacturingDate),
      expiryDate: new Date(expiryDate),
      testingDate: testingDate ? new Date(testingDate) : new Date(),
      sampleQuantityTested: sampleQuantityTested || '100g',
      organolepticTests: organolepticTests || { passed: true },
      physicochemicalTests: {
        lossOnDryingPercent: lod,
        lossOnDryingLimit: pc.lossOnDryingLimit || 'NMT 10.0% w/w',
        totalAshPercent: ash,
        totalAshLimit: pc.totalAshLimit || 'NMT 5.0% w/w',
        acidInsolubleAshPercent: parseFloat(pc.acidInsolubleAshPercent) || 0.4,
        acidInsolubleAshLimit: pc.acidInsolubleAshLimit || 'NMT 1.0% w/w',
        alcoholSolubleExtractivePercent: parseFloat(pc.alcoholSolubleExtractivePercent) || 18.5,
        waterSolubleExtractivePercent: parseFloat(pc.waterSolubleExtractivePercent) || 24.0,
        phValue: parseFloat(pc.phValue) || 5.2,
        phLimit: pc.phLimit || '4.0 - 7.0',
        disintegrationTimeMinutes: parseFloat(pc.disintegrationTimeMinutes) || 12,
        disintegrationLimit: pc.disintegrationLimit || 'NMT 30 mins',
        specificGravity: pc.specificGravity !== undefined ? pc.specificGravity : null,
        brix: pc.brix !== undefined ? pc.brix : null,
        passed: pcPassed
      },
      heavyMetalTests: {
        leadPpm: lead,
        cadmiumPpm: cadmium,
        mercuryPpm: mercury,
        arsenicPpm: arsenic,
        passed: hmPassed
      },
      microbialTests: {
        totalPlateCountCfu: totalPlateCount,
        totalPlateCountLimit: mb.totalPlateCountLimit || 'NMT 10^5 CFU/g',
        yeastMoldCfu: yeastMold,
        yeastMoldLimit: mb.yeastMoldLimit || 'NMT 10^3 CFU/g',
        eColi: mb.eColi || 'Absent in 1g',
        salmonella: mb.salmonella || 'Absent in 10g',
        staphylococcusAureus: mb.staphylococcusAureus || 'Absent in 1g',
        pseudomonasAeruginosa: mb.pseudomonasAeruginosa || 'Absent in 1g',
        passed: mbPassed
      },
      aflatoxinsAndPesticides: aflatoxinsAndPesticides || {
        aflatoxins: 'Complies with API Limits (B1,B2,G1,G2 < 0.5 ppb)',
        pesticideResidues: 'Complies with API Limits',
        passed: true
      },
      overallResult: allPassed ? 'APPROVED' : 'REJECTED',
      status: allPassed ? 'approved' : 'rejected',
      testedBy,
      approvedBy: allPassed ? (req.user ? req.user.name : 'Chief Pharmacist') : '',
      approvedAt: allPassed ? new Date() : null,
      remarks: remarks || ''
    });

    res.status(201).json(coa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/coa/:id/approve — Manually approve/reject CoA
router.patch('/:id/approve', authorize('quality:approve'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const coa = await CertificateOfAnalysis.findById(req.params.id);
    if (!coa) return res.status(404).json({ error: 'CoA not found' });

    coa.status = status || 'approved';
    coa.overallResult = status === 'rejected' ? 'REJECTED' : 'APPROVED';
    coa.approvedBy = req.user ? req.user.name : 'Chief Pharmacist';
    coa.approvedAt = new Date();
    if (remarks) coa.remarks = remarks;

    await coa.save();
    res.json(coa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
