const ProductionPlan = require('../models/ProductionPlan');
const Customer = require('../models/Customer');
const GeneralExpense = require('../models/GeneralExpense');
const StockTransfer = require('../models/StockTransfer');

describe('Backlog Phase D — Planning, Inventory, Field Force & Finance Suite', () => {
  it('instantiates ProductionPlan with multi-batch horizon planning', () => {
    const plan = new ProductionPlan({
      planNo: 'PLN/26-27/001',
      title: 'October 2026 Production Schedule',
      manufacturingUnitId: '507f1f77bcf86cd799439011',
      manufacturingUnitName: 'Main Factory Varanasi',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-15'),
      plannedBatches: [
        { productId: '507f1f77bcf86cd799439022', productName: 'Chyawanprash Special', plannedQty: 500 }
      ],
      rawMaterialSufficiencyStatus: 'sufficient'
    });

    expect(plan.planNo).toBe('PLN/26-27/001');
    expect(plan.plannedBatches.length).toBe(1);
    expect(plan.rawMaterialSufficiencyStatus).toBe('sufficient');
  });

  it('supports Customer segmentation tags and volume tiers', () => {
    const customer = new Customer({
      name: 'Varanasi Pharma Dist',
      tags: ['North Region', 'High Volume', 'Prompt Payee'],
      volumeTier: 'tier_1'
    });

    expect(customer.tags.length).toBe(3);
    expect(customer.volumeTier).toBe('tier_1');
  });

  it('tracks StockTransfer approval fields', () => {
    const transfer = new StockTransfer({
      transferNo: 'TRSF-0010',
      fromWarehouseId: '507f1f77bcf86cd799439011',
      fromWarehouseName: 'Main Store',
      toWarehouseId: '507f1f77bcf86cd799439022',
      toWarehouseName: 'Depot Lucknow',
      status: 'pending'
    });

    transfer.approvedBy = 'Warehouse Manager';
    transfer.approvedAt = new Date();

    expect(transfer.status).toBe('pending');
    expect(transfer.approvedBy).toBe('Warehouse Manager');
  });

  it('instantiates GeneralExpense for office and administrative costs', () => {
    const exp = new GeneralExpense({
      expenseNo: 'EXP/26-27/001',
      category: 'rent',
      title: 'Factory Warehouse Monthly Rent',
      amount: 45000,
      paymentMode: 'bank_transfer'
    });

    expect(exp.category).toBe('rent');
    expect(exp.amount).toBe(45000);
  });

  it('calculates MR incentive slab percentages based on achievement %', () => {
    function calculateCommissionSlabPercent(achievementPercent) {
      if (achievementPercent >= 120) return 5.0;
      if (achievementPercent >= 100) return 3.0;
      if (achievementPercent >= 85) return 1.5;
      return 0;
    }

    expect(calculateCommissionSlabPercent(125)).toBe(5.0);
    expect(calculateCommissionSlabPercent(105)).toBe(3.0);
    expect(calculateCommissionSlabPercent(90)).toBe(1.5);
    expect(calculateCommissionSlabPercent(70)).toBe(0);
  });
});
