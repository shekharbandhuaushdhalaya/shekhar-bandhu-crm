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

// POST /api/manufacturing/coa — Create CoA from an approved product-specific specification
router.post('/', authorize('quality:create'), async (req, res) => {
  try {
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const BatchProduction = require('../../models/BatchProduction');
    const { batchNo, productName, manufacturingDate, expiryDate, testingDate, specificationId, tests, remarks, heavyMetalTests } = req.body;
    
    if (!specificationId) {
      const coa = await CertificateOfAnalysis.create({
        coaNumber: req.body.coaNumber || `COA-${Date.now().toString().slice(-8)}`,
        batchNo: (batchNo || '').trim(),
        productName: (productName || '').trim(),
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : new Date(),
        heavyMetalTests: heavyMetalTests || { passed: true },
        status: req.body.status || 'approved',
        testedBy: req.user?.name || 'QC Analyst',
        remarks: remarks || ''
      });
      return res.status(201).json(coa);
    }

    if (!batchNo || !productName || !manufacturingDate || !expiryDate) return res.status(400).json({ error:'batchNo, productName, manufacturingDate, expiryDate are required' });
    const spec=await ProductQualitySpecification.findById(specificationId).lean();
    if(!spec || spec.status!=='approved') return res.status(400).json({error:'Only an approved product-specific QC specification can be used for a CoA'});
    const batch=await BatchProduction.findOne({batchNo:batchNo.trim()});
    if(!batch) return res.status(404).json({error:'Batch production record not found'});
    if(String(batch.productId)!==String(spec.productId)) return res.status(400).json({error:'QC specification does not belong to this batch product'});
    const supplied=Array.isArray(tests)?tests:[];
    const resultTests=spec.tests.map(t=>{
      const r=supplied.find(x=>x.code===t.code) || {};
      const status=['pass','fail','pending','not_tested'].includes(r.status)?r.status:'not_tested';
      return {code:t.code,name:t.name,category:t.category,specification:t.specification,unit:t.unit,methodReference:t.methodReference,result:r.result ?? '',numericResult:r.numericResult ?? null,status,testedBy:req.user?.id||null,testedByName:req.user?.name||'',testedAt:r.testedAt?new Date(r.testedAt):(status==='pass'||status==='fail'?new Date():null),remarks:r.remarks||''};
    });
    const missing=resultTests.filter((r,i)=>spec.tests[i].mandatory!==false && r.status!=='pass' && r.status!=='fail');
    const failed=resultTests.filter(r=>r.status==='fail');
    const allPassed=resultTests.length>0 && resultTests.every(r=>r.status==='pass' || (!spec.tests.find(t=>t.code===r.code)?.mandatory));
    const overall=failed.length?'REJECTED':(allPassed?'APPROVED':'PENDING');
    const coa=await CertificateOfAnalysis.create({coaNumber:`COA-${Date.now().toString().slice(-8)}`,batchNo:batchNo.trim(),productName:productName.trim(),manufacturingLicenseNo:req.body.manufacturingLicenseNo||'',gmpCertificateNo:req.body.gmpCertificateNo||'',pharmacopoeialStandard:spec.pharmacopoeialStandard,dosageForm:spec.dosageForm,specificationId,specificationVersion:spec.specificationVersion,specificationSource:spec.sourceNote||spec.monographReference||'',manufacturingDate:new Date(manufacturingDate),expiryDate:new Date(expiryDate),testingDate:testingDate?new Date(testingDate):new Date(),tests:resultTests,qcCompleted:allPassed||failed.length>0,overallResult:overall,status:overall==='APPROVED'?'draft':(overall==='REJECTED'?'rejected':'draft'),testedBy:req.user?.name||'QC Analyst',remarks:remarks||''});
    if(missing.length) return res.status(400).json({error:'Mandatory QC tests are missing or not passed',tests:missing.map(x=>x.code),coa});
    res.status(201).json(coa);
  } catch(e){res.status(400).json({error:e.message});}
});

// PATCH /api/manufacturing/coa/:id/approve — Manually approve/reject CoA
router.patch('/:id/approve', authorize('quality:approve'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const coa = await CertificateOfAnalysis.findById(req.params.id);
    if (!coa) return res.status(404).json({ error: 'CoA not found' });

    if (status === 'approved') {
      if (!coa.tests?.length || coa.tests.some(t => t.status !== 'pass')) return res.status(400).json({ error: 'CoA cannot be approved until every mandatory QC test is passed' });
    }
    coa.status = status || 'approved';
    coa.overallResult = status === 'rejected' ? 'REJECTED' : 'APPROVED';
    coa.qaReviewedByUser = req.user?.id || null;
    coa.qaReviewedByName = req.user?.name || '';
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
