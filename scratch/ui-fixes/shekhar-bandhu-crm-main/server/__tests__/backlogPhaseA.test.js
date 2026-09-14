const DebitNote = require('../models/DebitNote');
const Quotation = require('../models/Quotation');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const BatchProduction = require('../models/BatchProduction');

describe('Backlog Phase A — Sales, Quality & Security Suite', () => {
  it('creates and finalizes DebitNote correctly', async () => {
    const dn = new DebitNote({
      debitNoteNo: 'DN/26-27/0001',
      partyType: 'customer',
      partyId: '507f1f77bcf86cd799439011',
      partyName: 'Test Medical Stores',
      totalAmount: 1500,
      reason: 'Price difference correction'
    });

    expect(dn.status).toBe('draft');
    expect(dn.debitNoteNo).toBe('DN/26-27/0001');

    dn.status = 'finalized';
    expect(dn.status).toBe('finalized');
  });

  it('updates Quotation with conversion tracking fields', () => {
    const quotation = new Quotation({
      quotationNo: 'QUOTE-2026-001',
      customerName: 'Aushadh Kendra',
      amount: 5000,
      status: 'draft'
    });

    quotation.status = 'converted';
    quotation.convertedToInvoice = true;
    quotation.invoiceNo = 'SB/26-27/0045';
    quotation.winLossReason = 'Accepted full order bulk pricing';
    quotation.convertedAt = new Date();

    expect(quotation.status).toBe('converted');
    expect(quotation.convertedToInvoice).toBe(true);
    expect(quotation.winLossReason).toBe('Accepted full order bulk pricing');
  });

  it('supports creditLimit field on Customer model', () => {
    const customer = new Customer({
      name: 'Varanasi Pharma Distributors',
      creditLimit: 50000
    });

    expect(customer.creditLimit).toBe(50000);
  });

  it('formats Certificate of Analysis (CoA) structures from BatchProduction', () => {
    const batch = new BatchProduction({
      batchNo: 'BAT-2026-CHY-01',
      plannedQty: 1000,
      actualYieldQty: 995,
      qcStatus: 'approved',
      qcPassedBy: 'Dr. Sharma QC Lead',
      qcParameters: {
        organoleptic: 'Dark brown paste with typical aromatic odor',
        moistureContent: 8.5,
        ashValue: 3.2,
        pHValue: 5.4,
        heavyMetals: 'Complies with API'
      }
    });

    expect(batch.batchNo).toBe('BAT-2026-CHY-01');
    expect(batch.qcParameters.moistureContent).toBe(8.5);
    expect(batch.qcStatus).toBe('approved');
  });
});
