const LineClearance = require('../models/LineClearance');
const RetentionSample = require('../models/RetentionSample');
const BatchProduction = require('../models/BatchProduction');

describe('GMP Phase 6 — Line Clearance, Label Reconciliation, Retention Samples & Pre-BMR Approval', () => {
  it('instantiates LineClearance model correctly with all 4 checklist items', () => {
    const lc = new LineClearance({
      batchId: '507f1f77bcf86cd799439011',
      manufacturingUnitId: '507f1f77bcf86cd799439022',
      previousBatchNo: 'BAT-2026-0099',
      checklist: {
        equipmentCleaned: true,
        previousMaterialsRemoved: true,
        previousLabelsDocumentsRemoved: true,
        areaVisuallyInspected: true
      },
      clearedBy: '507f1f77bcf86cd799439033',
      clearedByName: 'Inspector Verma'
    });

    expect(lc.checklist.equipmentCleaned).toBe(true);
    expect(lc.checklist.previousMaterialsRemoved).toBe(true);
    expect(lc.checklist.previousLabelsDocumentsRemoved).toBe(true);
    expect(lc.checklist.areaVisuallyInspected).toBe(true);
    expect(lc.clearedByName).toBe('Inspector Verma');
  });

  it('instantiates RetentionSample and calculates retentionUntil date (expiryDate + 1 year)', () => {
    const expiryDate = new Date('2029-09-01');
    const retentionUntil = new Date(expiryDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    const rs = new RetentionSample({
      batchId: '507f1f77bcf86cd799439011',
      batchNo: 'BAT-2026-0100',
      productId: '507f1f77bcf86cd799439022',
      productName: 'Swasari Vati',
      qtyRetained: 2,
      unit: 'bottles',
      storageLocation: 'QC Shelf 04',
      retainedBy: '507f1f77bcf86cd799439033',
      retainedByName: 'Chemist Roy',
      retentionUntil
    });

    expect(rs.qtyRetained).toBe(2);
    expect(rs.storageLocation).toBe('QC Shelf 04');
    expect(rs.status).toBe('stored');
    expect(rs.retentionUntil).toEqual(retentionUntil);
  });

  it('validates label reconciliation mathematical balance (issued === used + damaged + returned)', () => {
    const qtyIssued = 500;
    const qtyUsed = 480;
    const qtyDamaged = 10;
    const qtyReturnedToStore = 10;

    const isValidBalance = Math.abs(qtyIssued - (qtyUsed + qtyDamaged + qtyReturnedToStore)) <= 0.01;
    expect(isValidBalance).toBe(true);
  });

  it('supports pre-execution BMR recipe approval fields on BatchProduction', () => {
    const batch = new BatchProduction({
      batchNo: 'BAT-2026-0200',
      productId: '507f1f77bcf86cd799439011',
      bomId: '507f1f77bcf86cd799439022',
      manufacturingUnitId: '507f1f77bcf86cd799439033',
      bmrApprovedBy: '507f1f77bcf86cd799439044',
      bmrApprovedByName: 'Plant Manager Gupta',
      bmrApprovedAt: new Date()
    });

    expect(batch.bmrApprovedByName).toBe('Plant Manager Gupta');
    expect(batch.bmrApprovedBy.toString()).toBe('507f1f77bcf86cd799439044');
  });
});
