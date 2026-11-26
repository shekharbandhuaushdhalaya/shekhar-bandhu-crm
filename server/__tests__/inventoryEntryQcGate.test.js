const express = require('express');
const request = require('supertest');

jest.mock('../models/InventoryEntry');
jest.mock('../models/StockLedger');
jest.mock('../models/Product');
jest.mock('../models/Warehouse');
jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => next()
}));
jest.mock('../middleware/validate', () => ({
  validate: () => (req, res, next) => next()
}));
jest.mock('../middleware/requiredIdempotency', () => (req, res, next) => next());
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn()
}));
jest.mock('../utils/auditLogger', () => ({
  logAction: jest.fn()
}));
jest.mock('../utils/tenantContext', () => ({
  getFirmId: jest.fn(() => 'firm-1')
}));

const InventoryEntry = require('../models/InventoryEntry');
const { withTransaction } = require('../utils/withTransaction');
const router = require('../routes/inventory/inventory-entries');

describe('Manual finished-goods receipt QC gate', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/inventory-entries', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(['approved', 'rejected'])(
    'rejects caller-supplied %s disposition before any stock transaction',
    async qcStatus => {
      const response = await request(app)
        .post('/api/inventory-entries')
        .send({
          warehouseId: '507f1f77bcf86cd799439011',
          warehouseName: 'Finished Goods',
          productId: '507f1f77bcf86cd799439012',
          qtyBoxes: 10,
          packing: 1,
          batchNo: 'MANUAL-RECEIPT-01',
          qcStatus
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INVENTORY_RECEIPT_QC_RELEASE_REQUIRED');
      expect(withTransaction).not.toHaveBeenCalled();
      expect(InventoryEntry.findOne).not.toHaveBeenCalled();
    }
  );
});
