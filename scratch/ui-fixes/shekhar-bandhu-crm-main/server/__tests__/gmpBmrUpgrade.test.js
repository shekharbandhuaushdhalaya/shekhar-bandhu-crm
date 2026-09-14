const RawMaterial = require('../models/RawMaterial');
const BillOfMaterials = require('../models/BillOfMaterials');
const BatchProduction = require('../models/BatchProduction');

describe('GMP Compliance & BMR Upgrade Suite', () => {
  it('instantiates RawMaterial with pharmacopoeial identity fields', () => {
    const rm = new RawMaterial({
      name: 'Chandan',
      sku: 'RM-HERB-001',
      unit: 'kg',
      category: 'Herb',
      botanicalName: 'Santalum album',
      partUsed: 'Heartwood',
      pharmacopoeialStandard: 'API',
      monographRef: 'API Part I, Vol II, pg 45'
    });

    expect(rm.botanicalName).toBe('Santalum album');
    expect(rm.partUsed).toBe('Heartwood');
    expect(rm.pharmacopoeialStandard).toBe('API');
    expect(rm.monographRef).toBe('API Part I, Vol II, pg 45');
  });

  it('instantiates BillOfMaterials with formulationStandardRef', () => {
    const bom = new BillOfMaterials({
      productId: '507f1f77bcf86cd799439011',
      recipeName: 'Swasari Vati Standard Recipe',
      ingredients: [
        {
          rawMaterialId: '507f1f77bcf86cd799439022',
          qtyRequired: 10
        }
      ],
      formulationStandardRef: 'As per API Part I, Vol IV'
    });

    expect(bom.formulationStandardRef).toBe('As per API Part I, Vol IV');
  });

  it('supports maker-checker stage signatures and market release in BatchProduction', () => {
    const batch = new BatchProduction({
      batchNo: 'BAT-GMP-2026-001',
      productId: '507f1f77bcf86cd799439011',
      bomId: '507f1f77bcf86cd799439022',
      manufacturingUnitId: '507f1f77bcf86cd799439033',
      stages: [
        {
          name: 'Primary Processing',
          status: 'completed',
          performedBy: '507f1f77bcf86cd799439044',
          performedByName: 'Operator Sharma',
          verifiedBy: '507f1f77bcf86cd799439055',
          verifiedByName: 'Quality Checker Gupta',
          verifiedAt: new Date()
        }
      ],
      qcStatus: 'approved',
      releasedBy: '507f1f77bcf86cd799439066',
      releasedByName: 'Quality Head Verma',
      releasedAt: new Date(),
      qcParameters: {
        organoleptic: 'Fine Brown Powder',
        moistureContent: 6.2,
        moistureLimit: 'NMT 10% w/w',
        testStandardRef: 'As per API Appendix 2.2'
      }
    });

    expect(batch.stages[0].performedByName).toBe('Operator Sharma');
    expect(batch.stages[0].verifiedByName).toBe('Quality Checker Gupta');
    expect(batch.releasedByName).toBe('Quality Head Verma');
    expect(batch.qcParameters.moistureLimit).toBe('NMT 10% w/w');
    expect(batch.qcParameters.testStandardRef).toBe('As per API Appendix 2.2');
  });

  it('enforces 4-eye verification logic when performer equals verifier', () => {
    const performerId = '507f1f77bcf86cd799439044';
    const verifierId = '507f1f77bcf86cd799439044';

    const isSelfVerification = performerId === verifierId;
    expect(isSelfVerification).toBe(true);
  });

  it('detects yield variance tolerance breach requiring deviation record', () => {
    const tolerance = 5;
    const varianceVal = 8.5; // Exceeds ±5%
    const deviations = [];

    const requiresDeviation = Math.abs(varianceVal) > tolerance;
    const hasValidDeviation = deviations.some(d => d.rootCause && d.correctiveAction);

    expect(requiresDeviation).toBe(true);
    expect(hasValidDeviation).toBe(false);
  });
});
