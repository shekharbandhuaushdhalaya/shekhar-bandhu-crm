const ProductionPlan = require('../models/ProductionPlan');
const Equipment = require('../models/Equipment');
const DeviationCapa = require('../models/DeviationCapa');
const BatchProduction = require('../models/BatchProduction');

describe('Structural Manufacturing & Compliance Suite', () => {
  it('instantiates ProductionPlan correctly', () => {
    const plan = new ProductionPlan({
      planNo: 'PLAN-2026-001',
      name: 'September Week 1 Production Run',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
      manufacturingUnitId: '507f1f77bcf86cd799439011',
      batchIds: ['507f1f77bcf86cd799439022', '507f1f77bcf86cd799439033']
    });

    expect(plan.planNo).toBe('PLAN-2026-001');
    expect(plan.batchIds.length).toBe(2);
    expect(plan.status).toBe('draft');
  });

  it('instantiates Equipment model and detects calibration due dates', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const eq = new Equipment({
      code: 'MIX-01',
      name: 'High-Speed Fluidized Mixer 500L',
      category: 'mixer',
      manufacturingUnitId: '507f1f77bcf86cd799439011',
      calibrationDueDate: pastDate
    });

    expect(eq.code).toBe('MIX-01');
    expect(eq.category).toBe('mixer');
    expect(new Date(eq.calibrationDueDate) <= now).toBe(true);
  });

  it('instantiates DeviationCapa model correctly', () => {
    const dev = new DeviationCapa({
      deviationNo: 'DEV-2026-001',
      batchId: '507f1f77bcf86cd799439022',
      batchNo: 'BAT-2026-0001',
      stageName: 'QC Testing',
      deviationType: 'qc_failure',
      description: 'Moisture content above specification at 8.2%'
    });

    expect(dev.deviationNo).toBe('DEV-2026-001');
    expect(dev.deviationType).toBe('qc_failure');
    expect(dev.status).toBe('open');
  });

  it('supports stage-wise equipment, temperature, and humidity logging in BatchProduction', () => {
    const batch = new BatchProduction({
      batchNo: 'BAT-2026-0005',
      productId: '507f1f77bcf86cd799439011',
      bomId: '507f1f77bcf86cd799439022',
      manufacturingUnitId: '507f1f77bcf86cd799439033',
      stages: [
        {
          name: 'Drying',
          status: 'in_progress',
          equipmentName: 'Tray Drier 02',
          temperatureCelsius: 45.5,
          humidityPct: 35.0,
          ambientVerified: true
        }
      ]
    });

    expect(batch.stages[0].equipmentName).toBe('Tray Drier 02');
    expect(batch.stages[0].temperatureCelsius).toBe(45.5);
    expect(batch.stages[0].humidityPct).toBe(35.0);
    expect(batch.stages[0].ambientVerified).toBe(true);
  });
});
