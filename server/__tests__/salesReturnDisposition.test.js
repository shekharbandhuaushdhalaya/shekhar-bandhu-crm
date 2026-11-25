jest.mock('../models/SalesReturn', () => ({ findById: jest.fn() }));
jest.mock('../models/InventoryEntry', () => {
  const Model = jest.fn(function InventoryEntry(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
    this.toObject = () => ({
      warehouseId: this.warehouseId, warehouseName: this.warehouseName,
      productId: this.productId, vendorId: this.vendorId, packing: this.packing,
      batchNo: this.batchNo, qtyBoxes: this.qtyBoxes, marketReleased: this.marketReleased,
      qcStatus: this.qcStatus, firmId: this.firmId
    });
  });
  Model.findOne = jest.fn();
  return Model;
});
jest.mock('../models/StockLedger', () => ({ create: jest.fn().mockResolvedValue([]) }));
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(work => work({ id: 'session-qc' })) }));

const SalesReturn = require('../models/SalesReturn');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const { withTransaction } = require('../utils/withTransaction');
const { dispositionSalesReturnItem } = require('../services/salesReturnService');

describe('Returned-stock QA disposition transaction', () => {
  let returned;
  let held;
  const actor = { id: '507f191e810c19729de860ea', name: 'Independent QA' };

  beforeEach(() => {
    jest.clearAllMocks();
    held = {
      _id: 'held-entry', warehouseId: 'warehouse-1', warehouseName: 'Returns Hold',
      productId: 'product-1', vendorId: 'vendor-1', packing: 1, batchNo: 'B-RETURN-01',
      qtyBoxes: 5, qcStatus: 'under_test', marketReleased: false,
      save: jest.fn().mockResolvedValue(true),
      toObject: () => ({
        _id: 'held-entry', warehouseId: 'warehouse-1', warehouseName: 'Returns Hold',
        productId: 'product-1', vendorId: 'vendor-1', packing: 1, batchNo: 'B-RETURN-01',
        qtyBoxes: 5, qcStatus: 'under_test', marketReleased: false, firmId: 'firm-1'
      })
    };
    returned = {
      _id: 'return-1', returnNo: 'SR-00001', status: 'posted', postedBy: '507f191e810c19729de860eb',
      warehouseId: 'warehouse-1',
      items: [{ productId: 'product-1', name: 'Herbal Tablets', qty: 2, batchNo: 'B-RETURN-01',
        packing: 1, vendorId: 'vendor-1', vendorName: 'Supplier', qcDisposition: 'pending' }],
      save: jest.fn().mockResolvedValue(true)
    };
    SalesReturn.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(returned) });
    InventoryEntry.findOne
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(held) })
      .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(null) });
  });

  test('moves returned stock from QC hold to approved only after independent evidence', async () => {
    const result = await dispositionSalesReturnItem('return-1', 0, {
      disposition: 'approved', actor, notes: 'Identity, batch and condition independently inspected'
    });
    expect(result).toBe(returned);
    expect(held.qtyBoxes).toBe(3);
    expect(held.save).toHaveBeenCalledWith({ session: { id: 'session-qc' } });
    const destination = InventoryEntry.mock.instances[0];
    expect(destination.qcStatus).toBe('approved');
    expect(destination.qtyBoxes).toBe(2);
    expect(destination.marketReleased).toBe(true);
    expect(returned.items[0]).toMatchObject({
      qcDisposition: 'approved', qcReviewedBy: actor.id,
      qcReviewedByName: actor.name, qcReviewNotes: 'Identity, batch and condition independently inspected'
    });
    expect(returned.items[0].qcReviewedAt).toBeInstanceOf(Date);
    expect(StockLedger.create).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: 'ADJUSTMENT', qtyBoxes: -2 }),
      expect.objectContaining({ type: 'ADJUSTMENT', qtyBoxes: 2 })
    ]), { session: { id: 'session-qc' } });
  });

  test('keeps rejected returned stock outside market-released inventory', async () => {
    await dispositionSalesReturnItem('return-1', 0, {
      disposition: 'rejected', actor, notes: 'Failed identity and physical condition inspection'
    });
    const destination = InventoryEntry.mock.instances[0];
    expect(destination.qcStatus).toBe('rejected');
    expect(destination.marketReleased).toBe(false);
  });

  test('prevents the return poster from independently approving returned stock', async () => {
    returned.postedBy = actor.id;
    await expect(dispositionSalesReturnItem('return-1', 0, {
      disposition: 'approved', actor, notes: 'Identity and condition checked'
    })).rejects.toMatchObject({ code: 'RETURN_QC_MAKER_CHECKER_REQUIRED' });
    expect(InventoryEntry.findOne).not.toHaveBeenCalled();
    expect(StockLedger.create).not.toHaveBeenCalled();
  });

  test('rejects a second disposition for an already reviewed return line without stock movements', async () => {
    returned.items[0].qcDisposition = 'approved';
    await expect(dispositionSalesReturnItem('return-1', 0, {
      disposition: 'rejected', actor, notes: 'Second review attempt with sufficient notes'
    })).rejects.toMatchObject({ code: 'RETURN_QC_ALREADY_DISPOSITIONED' });
    expect(InventoryEntry.findOne).not.toHaveBeenCalled();
    expect(StockLedger.create).not.toHaveBeenCalled();
  });

  test('fails closed when the returned quantity is missing from the QC-hold stock bucket', async () => {
    InventoryEntry.findOne.mockReset();
    InventoryEntry.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
    await expect(dispositionSalesReturnItem('return-1', 0, {
      disposition: 'approved', actor, notes: 'Inspected return and attempted to locate held stock'
    })).rejects.toMatchObject({ code: 'RETURN_QC_HOLD_STOCK_MISSING' });
    expect(StockLedger.create).not.toHaveBeenCalled();
    expect(returned.save).not.toHaveBeenCalled();
  });
  test('requires notes and a valid disposition before starting a transaction', async () => {
    await expect(dispositionSalesReturnItem('return-1', 0, {
      disposition: 'approved', actor, notes: 'short'
    })).rejects.toMatchObject({ code: 'RETURN_QC_EVIDENCE_REQUIRED' });
    await expect(dispositionSalesReturnItem('return-1', 0, {
      disposition: 'pending', actor, notes: 'A sufficiently detailed inspection record'
    })).rejects.toMatchObject({ code: 'INVALID_RETURN_QC_DISPOSITION' });
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
