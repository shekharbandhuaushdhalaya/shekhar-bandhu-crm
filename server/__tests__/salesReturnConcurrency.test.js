jest.mock('../models/SalesReturn');
jest.mock('../models/Challan');
jest.mock('../models/Invoice');
jest.mock('../models/Customer');
jest.mock('../models/Warehouse');
jest.mock('../models/Product');
jest.mock('../models/InventoryEntry');
jest.mock('../models/StockLedger');
jest.mock('../models/CreditNote');
jest.mock('../utils/documentCounter', () => ({ generateAtomicDocumentNumber: jest.fn() }));
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(async work => work({ id: 'session-return' }))
}));

const SalesReturn = require('../models/SalesReturn');
const Challan = require('../models/Challan');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const { postSalesReturn } = require('../services/salesReturnService');
const { withTransaction } = require('../utils/withTransaction');

describe('Sales Return posting serialization', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires an authenticated posting actor before opening a transaction', async () => {
    await expect(postSalesReturn('return-1', {})).rejects.toMatchObject({ code: 'RETURN_POSTER_REQUIRED' });
    await expect(postSalesReturn('return-1', { id: 'reviewer-1' })).rejects.toMatchObject({ code: 'RETURN_POSTER_REQUIRED' });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('bumps the source Challan revision inside the posting transaction before cumulative checks', async () => {
    const ret = {
      _id: 'return-1', status: 'draft', resolution: 'replacement',
      challanId: 'challan-1', customerId: 'customer-1', warehouseId: 'warehouse-1',
      items: [], save: jest.fn().mockResolvedValue(true)
    };
    const challan = {
      _id: 'challan-1', challanType: 'sale', status: 'finalized',
      inventoryPostingStatus: 'posted', customerId: 'customer-1', items: []
    };
    SalesReturn.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue(ret) }));
    SalesReturn.find = jest.fn(() => {
      const query = {
        select: jest.fn(() => query),
        lean: jest.fn(() => query),
        session: jest.fn(() => query),
        then: (resolve, reject) => Promise.resolve([]).then(resolve, reject)
      };
      return query;
    });
    Challan.findOne = jest.fn(() => ({ session: jest.fn().mockResolvedValue(challan) }));
    Challan.findOneAndUpdate = jest.fn().mockResolvedValue({ ...challan, salesReturnRevision: 1 });
    Customer.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue({ _id: 'customer-1' }) }));
    Warehouse.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue({ _id: 'warehouse-1' }) }));

    await postSalesReturn('return-1', { id: 'reviewer-2', name: 'Independent Reviewer' });

    expect(Challan.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'challan-1', challanType: 'sale', status: 'finalized', inventoryPostingStatus: 'posted' },
      { $inc: { salesReturnRevision: 1 } },
      { new: true, session: { id: 'session-return' } }
    );
    expect(ret.status).toBe('posted');
    expect(ret.save).toHaveBeenCalledWith({ session: { id: 'session-return' } });
  });

  test('stops posting if the source Challan cannot be conditionally locked', async () => {
    const ret = {
      _id: 'return-1', status: 'draft', resolution: 'replacement',
      challanId: 'challan-1', customerId: 'customer-1', warehouseId: 'warehouse-1',
      items: [], save: jest.fn()
    };
    SalesReturn.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue(ret) }));
    Challan.findOne = jest.fn(() => ({ session: jest.fn().mockResolvedValue({
      _id: 'challan-1', challanType: 'sale', status: 'finalized',
      inventoryPostingStatus: 'posted', customerId: 'customer-1', items: []
    }) }));
    Challan.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    Customer.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue({ _id: 'customer-1' }) }));
    Warehouse.findById = jest.fn(() => ({ session: jest.fn().mockResolvedValue({ _id: 'warehouse-1' }) }));

    await expect(postSalesReturn('return-1', { id: 'reviewer-2', name: 'Independent Reviewer' }))
      .rejects.toMatchObject({ code: 'RETURN_SOURCE_CONCURRENT_UPDATE' });
    expect(ret.save).not.toHaveBeenCalled();
  });
});
