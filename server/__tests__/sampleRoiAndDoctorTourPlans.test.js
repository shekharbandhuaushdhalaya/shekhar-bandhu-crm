const express = require('express');
const request = require('supertest');

jest.mock('../models/Doctor');
jest.mock('../models/Invoice');
jest.mock('../models/MrSampleStock');
jest.mock('../models/MrSampleIssuance');
jest.mock('../models/MedicalRepresentative');
jest.mock('../models/MrVisit');
jest.mock('../models/MrTourPlan');
jest.mock('../models/Product');
jest.mock('../models/RolePermission');

const Doctor = require('../models/Doctor');
const Invoice = require('../models/Invoice');
const MrSampleStock = require('../models/MrSampleStock');
const MrSampleIssuance = require('../models/MrSampleIssuance');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const doctorsRouter = require('../routes/crm/doctors');
const mrRouter = require('../routes/crm/medicalReps');

describe('Task 3: Sample Issuance Log, Doctor ROI & Doctor-Linked Tour Planning', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test Manager', role: 'admin' };
      next();
    });
    app.use('/api/doctors', doctorsRouter);
    app.use('/api/medical-reps', mrRouter);
    app.use('/api/mr-sample-stock', mrRouter);
    app.use('/api/mr-tour-plans', mrRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  describe('3a. Sample Issuance Log', () => {
    test('POST /api/mr-sample-stock/issue-to-doctor decrements stock and creates MrSampleIssuance record', async () => {
      MrSampleStock.findOneAndUpdate.mockResolvedValue({ mrId: 'mr_101', productId: 'prod_101', qty: 20 });
      Product.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ price: 150 })
      });
      MrSampleIssuance.create.mockImplementation(async (data) => ({
        _id: 'issuance_1',
        ...data
      }));

      const res = await request(app)
        .post('/api/mr-sample-stock/issue-to-doctor')
        .send({
          mrId: 'mr_101',
          doctorId: 'doc_101',
          productId: 'prod_101',
          qty: 5,
          unitCost: 150
        });

      expect(res.status).toBe(201);
      expect(MrSampleStock.findOneAndUpdate).toHaveBeenCalledWith(
        { mrId: 'mr_101', productId: 'prod_101' },
        { $inc: { qty: -5 } },
        { upsert: false }
      );
      expect(MrSampleIssuance.create).toHaveBeenCalledWith(expect.objectContaining({
        mrId: 'mr_101',
        doctorId: 'doc_101',
        productId: 'prod_101',
        qty: 5,
        unitCost: 150
      }));
    });
  });

  describe('3b. Doctor ROI & MR Rollup Reports', () => {
    test('GET /api/doctors/:id/sample-roi computes total sample cost, rx revenue, and ROI ratio', async () => {
      Doctor.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'doc_101', name: 'Dr. S. K. Roy' })
      });
      Invoice.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'inv_1', amount: 10000 },
          { _id: 'inv_2', amount: 5000 }
        ])
      });
      MrSampleIssuance.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { qty: 10, unitCost: 100 },
          { qty: 5, unitCost: 200 }
        ])
      });

      const res = await request(app).get('/api/doctors/doc_101/sample-roi');
      expect(res.status).toBe(200);
      expect(res.body.doctorId).toBe('doc_101');
      expect(res.body.totalRxRevenue).toBe(15000);
      expect(res.body.totalSampleCost).toBe(2000); // (10*100) + (5*200) = 2000
      expect(res.body.roiRatio).toBe(7.5); // 15000 / 2000 = 7.5
    });

    test('GET /api/medical-reps/:id/sample-roi computes MR aggregate ROI across assigned doctors', async () => {
      MedicalRepresentative.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'mr_101', name: 'Ramesh' })
      });
      Doctor.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'doc_101', name: 'Dr. S. K. Roy' },
          { _id: 'doc_102', name: 'Dr. P. Sharma' }
        ])
      });
      MrSampleIssuance.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { qty: 10, unitCost: 100 }
        ])
      });
      Invoice.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'inv_1', amount: 5000 }
        ])
      });

      const res = await request(app).get('/api/medical-reps/mr_101/sample-roi');
      expect(res.status).toBe(200);
      expect(res.body.mrId).toBe('mr_101');
      expect(res.body.doctorCount).toBe(2);
      expect(res.body.totalSampleCost).toBe(1000);
      expect(res.body.totalRxRevenue).toBe(5000);
      expect(res.body.roiRatio).toBe(5);
    });
  });

  describe('3c. Doctor-Linked Tour Plan Suggestions', () => {
    test('GET /api/mr-tour-plans/suggest filters doctors by preferred visit day for specified date', async () => {
      Doctor.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'doc_1', name: 'Dr. Monday Doc', preferredVisitDay: 'Monday', latitude: 25.31, longitude: 82.97 }
        ])
      });

      // 2026-09-07 is a Monday
      const res = await request(app).get('/api/mr-tour-plans/suggest?mrId=mr_101&date=2026-09-07&lat=25.30&lng=82.96');
      if (res.status !== 200) console.log('SUGGEST ERROR PAYLOAD:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.dayOfWeek).toBe('Monday');
      expect(res.body.suggestedCount).toBe(1);
      expect(res.body.doctors[0].name).toBe('Dr. Monday Doc');
      expect(res.body.doctors[0].distanceKm).toBeDefined();
    });
  });
});
