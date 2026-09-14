const RawMaterialEntry = require('../models/RawMaterialEntry');
const InventoryEntry = require('../models/InventoryEntry');
const RawMaterial = require('../models/RawMaterial');
const Product = require('../models/Product');
const StabilityStudy = require('../models/StabilityStudy');
const InternalAudit = require('../models/InternalAudit');
const TrainingRecord = require('../models/TrainingRecord');
const SystemSettings = require('../models/SystemSettings');

describe('GMP Phase 7 — Schedule T (2026 Amendment) Compliance Suite', () => {
  it('defaults RawMaterialEntry and InventoryEntry qcStatus to under_test', () => {
    const rmEntry = new RawMaterialEntry({
      rawMaterialId: '507f1f77bcf86cd799439011',
      batchNo: 'RM-LOT-001',
      qty: 100,
      purchaseRate: 50
    });

    const invEntry = new InventoryEntry({
      warehouseId: '507f1f77bcf86cd799439022',
      warehouseName: 'Main Warehouse',
      productId: '507f1f77bcf86cd799439033',
      packing: 1,
      batchNo: 'FG-LOT-001'
    });

    expect(rmEntry.qcStatus).toBe('under_test');
    expect(invEntry.qcStatus).toBe('under_test');
  });

  it('supports standardized raw material categories and Schedule E1 flag', () => {
    const rm = new RawMaterial({
      name: 'Vatsanabha',
      sku: 'RM-HERB-E1-01',
      unit: 'kg',
      category: 'Schedule E1',
      isScheduleE1: true
    });

    expect(rm.category).toBe('Schedule E1');
    expect(rm.isScheduleE1).toBe(true);
  });

  it('instantiates Product with specificProductCode and spcComponents', () => {
    const prod = new Product({
      name: 'Chyawanprash Special',
      sku: 'PROD-CHY-01',
      category: 'Proprietary',
      specificProductCode: 'UP/D/1234/PP/0001/2026',
      spcComponents: {
        stateCode: 'UP',
        licenceType: 'D',
        licenceSerial: '1234',
        systemOfMedicine: 'PP',
        productSerial: '0001',
        approvalYear: 2026
      }
    });

    expect(prod.specificProductCode).toBe('UP/D/1234/PP/0001/2026');
    expect(prod.spcComponents.stateCode).toBe('UP');
    expect(prod.spcComponents.systemOfMedicine).toBe('PP');
  });

  it('computes realTimeFollowUpDueBy for accelerated stability studies', () => {
    const grantedShelfLifeYears = 2;
    const now = new Date();
    const realTimeFollowUpDueBy = new Date(now.getTime() + (grantedShelfLifeYears + 1) * 365 * 24 * 60 * 60 * 1000);

    const study = new StabilityStudy({
      productId: '507f1f77bcf86cd799439011',
      studyType: 'accelerated',
      durationMonthsStudied: 6,
      grantedShelfLifeYears,
      realTimeFollowUpDueBy
    });

    expect(study.studyType).toBe('accelerated');
    expect(study.realTimeFollowUpDueBy).toEqual(realTimeFollowUpDueBy);
    expect(study.status).toBe('open');
  });

  it('instantiates InternalAudit and TrainingRecord for compliance tracking', () => {
    const audit = new InternalAudit({
      manufacturingUnitId: '507f1f77bcf86cd799439011',
      scheduledDate: new Date('2026-10-15'),
      scope: 'Raw material store and QC section',
      status: 'scheduled'
    });

    const training = new TrainingRecord({
      userId: '507f1f77bcf86cd799439022',
      userName: 'Operator Sharma',
      topic: 'Schedule T GMP Refresher & Line Clearance',
      trainedOn: new Date('2026-08-01')
    });

    expect(audit.scope).toBe('Raw material store and QC section');
    expect(audit.status).toBe('scheduled');
    expect(training.topic).toBe('Schedule T GMP Refresher & Line Clearance');
  });

  it('supports licenceValidityType in SystemSettings', () => {
    const settings = new SystemSettings({
      firmName: 'Shekhar Bandhu Aushadhalaya',
      licenceValidityType: 'perpetual'
    });

    expect(settings.licenceValidityType).toBe('perpetual');
  });
});
