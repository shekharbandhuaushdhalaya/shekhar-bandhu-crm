const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/Doctor');
jest.mock('../models/Invoice');
jest.mock('../models/MrSampleStock');
jest.mock('../models/MedicalRepresentative');
jest.mock('../models/MrVisit');
jest.mock('../models/Notification');
jest.mock('../models/BatchProduction');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/SystemSettings');
jest.mock('../models/LineClearance');
jest.mock('../models/RetentionSample');
jest.mock('../models/Product');
jest.mock('../models/RolePermission');
jest.mock('../models/PharmacopoeiaEntry');
jest.mock('../utils/botanicalLookup', () => ({
  getBotanicalProfile: jest.fn().mockResolvedValue({ latinName: 'Withania somnifera', partUsed: 'Root', standard: 'API', monographRef: 'API Part I, Vol I, Pg 15' })
}));

jest.setTimeout(15000);

const Doctor = require('../models/Doctor');
const Invoice = require('../models/Invoice');
const MrSampleStock = require('../models/MrSampleStock');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const MrVisit = require('../models/MrVisit');
const Notification = require('../models/Notification');
const BatchProduction = require('../models/BatchProduction');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');
const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

// Routers
const doctorsRouter = require('../routes/crm/doctors');
const mrRouter = require('../routes/crm/medicalReps');
const batchRouter = require('../routes/manufacturing/batchProductions');
const { sendDoctorGreetings } = require('../utils/digestScheduler');

describe('5 CRM Enhancements Integration Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test User', role: 'admin' };
      next();
    });
    app.use('/api/doctors', doctorsRouter);
    app.use('/api/medical-reps', mrRouter);
    app.use('/api/batch-productions', batchRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
    if (PharmacopoeiaEntry.findOne) {
      PharmacopoeiaEntry.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ verified: true, source: 'manual' }) });
    }
  });

  describe('1. Doctor Rx Sales Analytics', () => {
    test('GET /api/doctors/:id/rx-analytics computes total revenue from prescribing doctor invoices', async () => {
      Doctor.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'doc_123', name: 'Dr. V. K. Sharma' })
      });
      Invoice.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'inv_1', invoiceNo: 'INV-001', amount: 5000, customerName: 'Apollomed' },
          { _id: 'inv_2', invoiceNo: 'INV-002', amount: 3500, customerName: 'City Chemist' }
        ])
      });

      const res = await request(app).get('/api/doctors/doc_123/rx-analytics');
      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe('doc_123');
      expect(res.body.totalRxRevenue).toBe(8500);
      expect(res.body.invoiceCount).toBe(2);
    });
  });

  describe('2. MR Field Bag Sample Stock', () => {
    test('GET /api/medical-reps/:mrId/sample-stock returns MR bag inventory', async () => {
      MrSampleStock.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ mrId: 'mr_1', qty: 10 }])
        })
      });

      const res = await request(app).get('/api/medical-reps/mr_1/sample-stock');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('POST /api/medical-reps/:mrId/sample-stock/issue updates bag stock', async () => {
      MedicalRepresentative.findById.mockResolvedValue({ name: 'Rajesh' });
      MrSampleStock.findOneAndUpdate.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ mrId: 'mr_1', qty: 15 })
      });

      const res = await request(app)
        .post('/api/medical-reps/mr_1/sample-stock/issue')
        .send({ items: [{ productId: 'prod_1', qty: 5 }] });

      expect(res.status).toBe(200);
      expect(res.body.stock).toHaveLength(1);
    });
  });

  describe('3. Automated Doctor Birthday & Anniversary Greetings', () => {
    test('sendDoctorGreetings dispatches SMS & creates notification for matching doctor event', async () => {
      const today = new Date();
      Doctor.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'doc_1',
              name: 'A. K. Gupta',
              phone: '9876543210',
              birthday: today,
              assignedMrId: { name: 'Rajesh' }
            }
          ])
        })
      });

      Notification.create.mockResolvedValue({});

      const result = await sendDoctorGreetings();
      expect(result.sentCount).toBeGreaterThanOrEqual(1);
      expect(Notification.create).toHaveBeenCalled();
    });
  });

  describe('4. Pharmacopoeia BMR Validation', () => {
    test('GET /api/batch-productions/:id/bmr-report attaches pharmacopoeiaSpecs to raw materials', async () => {
      const SystemSettings = require('../models/SystemSettings');
      const LineClearance = require('../models/LineClearance');
      const RetentionSample = require('../models/RetentionSample');
      const Product = require('../models/Product');
      const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');

      PharmacopoeiaEntry.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ verified: true, source: 'manual' }) });
      SystemSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      LineClearance.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      RetentionSample.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      });

      BatchProduction.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({
              _id: 'batch_1',
              batchNo: 'B-2026-01',
              ingredientsConsumed: [
                {
                  rawMaterialId: { name: 'Ashwagandha', unit: 'kg' },
                  rawMaterialEntryId: 'rm_entry_1',
                  qtyConsumed: 10,
                  batchNo: 'RM-BATCH-1'
                }
              ]
            })
          })
        })
      });

      RawMaterialEntry.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ purchaseRate: 150 })
      });

      const res = await request(app).get('/api/batch-productions/batch_1/bmr-report');
      if (res.status !== 200) console.log('BMR REPORT ERROR PAYLOAD:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.ingredients).toHaveLength(1);
      expect(res.body.ingredients[0].pharmacopoeiaSpecs).toBeDefined();
    });
  });

  describe('5. Doctor Route Map Clustering', () => {
    test('POST /api/medical-reps/:mrId/optimize-route clusters doctors and returns area summary', async () => {
      Doctor.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'd1', name: 'Dr. A', areaName: 'Varanasi Central', category: 'A', latitude: 25.31, longitude: 82.97 },
          { _id: 'd2', name: 'Dr. B', areaName: 'Varanasi Central', category: 'B', latitude: 25.32, longitude: 82.98 }
        ])
      });

      const res = await request(app)
        .post('/api/medical-reps/mr_1/optimize-route')
        .send({ areaName: 'Varanasi' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.areaClusters).toBeDefined();
      expect(res.body.itinerary).toHaveLength(2);
    });
  });
});
