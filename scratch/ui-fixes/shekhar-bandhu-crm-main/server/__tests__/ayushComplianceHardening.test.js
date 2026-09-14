const mongoose = require('mongoose');
const ProductQualitySpecification = require('../models/ProductQualitySpecification');
const CertificateOfAnalysis = require('../models/CertificateOfAnalysis');
const BatchProduction = require('../models/BatchProduction');

describe('AYUSH compliance hardening',()=>{
  test('quality specification requires product, dosage form, pharmacopoeial standard and version',()=>{
    const s=new ProductQualitySpecification({productId:new mongoose.Types.ObjectId(),dosageForm:'Churna',pharmacopoeialStandard:'API',specificationVersion:'API-2026-01',tests:[{code:'LOD',name:'Loss on drying',specification:'Product monograph'}]});
    expect(s.validateSync()).toBeUndefined();
  });
  test('CoA schema no longer gives default PASS to missing tests',()=>{
    const c=new CertificateOfAnalysis({coaNumber:'T1',batchNo:'B1',productName:'P',manufacturingDate:new Date(),expiryDate:new Date(),testedBy:'QC'});
    expect(c.tests).toHaveLength(0); expect(c.overallResult).toBe('PENDING');
  });
  test('BMR model has explicit QC test and specification fields',()=>{
    const b=new BatchProduction({batchNo:'B1',productId:new mongoose.Types.ObjectId(),manufacturingUnitId:new mongoose.Types.ObjectId(),plannedQty:10});
    b.qcSpecificationVersion='1.0'; b.qcTests=[{code:'ID',name:'Identity',status:'pass'}];
    expect(b.validateSync()).toBeUndefined(); expect(b.qcTests[0].status).toBe('pass');
  });
});
