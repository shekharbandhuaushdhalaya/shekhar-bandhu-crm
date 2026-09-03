const RecurringInvoice = require('../models/RecurringInvoice');
const Recall = require('../models/Recall');
const Stocktake = require('../models/Stocktake');
const Contact = require('../models/Contact');

describe('Backlog Phase B — Operations, Inventory & Finance Suite', () => {
  it('instantiates and manages RecurringInvoice templates', () => {
    const template = new RecurringInvoice({
      templateName: 'Monthly Distributor Retainer',
      customerName: 'Aushadh Depot Varanasi',
      frequency: 'monthly',
      nextRunDate: new Date('2026-10-01'),
      items: [{ name: 'Chyawanprash Special', qty: 50, rate: 200, amount: 10000 }],
      totalAmount: 10000
    });

    expect(template.frequency).toBe('monthly');
    expect(template.status).toBe('active');
    expect(template.items.length).toBe(1);
  });

  it('instantiates Recall model for batch-traceable product recalls', () => {
    const recall = new Recall({
      recallNo: 'RCL/26-27/001',
      batchNo: 'BAT-2026-CHY-01',
      productName: 'Chyawanprash 500g',
      reason: 'Packaging seal integrity failure',
      severity: 'class_II',
      affectedCustomers: [
        { customerName: 'City Chemist', invoiceNo: 'SB/26-27/0010', suppliedQty: 100, notified: false }
      ],
      totalAffectedQty: 100
    });

    expect(recall.recallNo).toBe('RCL/26-27/001');
    expect(recall.severity).toBe('class_II');
    expect(recall.affectedCustomers[0].suppliedQty).toBe(100);
  });

  it('instantiates Stocktake model for physical cycle count variance', () => {
    const expectedQty = 100;
    const countedQty = 95;
    const varianceQty = countedQty - expectedQty;

    const stocktake = new Stocktake({
      stocktakeNo: 'STK/26-27/0001',
      warehouseId: '507f1f77bcf86cd799439011',
      warehouseName: 'Main Warehouse',
      items: [
        {
          productId: '507f1f77bcf86cd799439022',
          productName: 'Ashwagandha Churna',
          batchNo: 'ASH-001',
          expectedQty,
          countedQty,
          varianceQty
        }
      ],
      totalVarianceBoxes: varianceQty
    });

    expect(stocktake.items[0].varianceQty).toBe(-5);
    expect(stocktake.status).toBe('draft');
  });

  it('supports Contact merging structures', () => {
    const master = new Contact({
      name: 'Dr. Sharma Clinic',
      phone: '9876543210',
      interactions: [{ type: 'Call', note: 'Discussed sample' }]
    });

    const duplicate = new Contact({
      name: 'Dr Sharma',
      phone: '9876543210',
      interactions: [{ type: 'Visit', note: 'Visited clinic' }]
    });

    master.interactions.push(...duplicate.interactions);
    expect(master.interactions.length).toBe(2);
  });
});
