const express = require('express');
const request = require('supertest');

jest.mock('../models/Doctor');
jest.mock('../models/Invoice');
// Field-bag sample stock now lives on the canonical MrSampleBag model, and
// sample issuance to a doctor runs inside a real Mongoose transaction via
// mrSampleInventoryService.consumeSamplesFromMr (see routes/crm/medicalReps.js).
jest.mock('../models/MrSampleBag');
jest.mock('../services/mrSampleInventoryService');
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(work => work(null)),
}));
jest.mock('../models/MrSampleIssuance');
jest.mock('../models/MedicalRepresentative');
jest.mock('../models/MrVisit');
jest.mock('../models/MrTourPlan');
jest.mock('../models/Product');
jest.mock('../models/RolePermission');
jest.mock('../models/SampleConversion');

const Doctor = require('../models/Doctor');
const Invoice = require('../models/Invoice');
const MrSampleIssuance = require('../models/MrSampleIssuance');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');
const SampleConversion = require('../models/SampleConversion');
const { consumeSamplesFromMr } = require('../services/mrSampleInventoryService');

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
    // Issuance now runs inside a real Mongoose transaction: sample stock is
    // debited from the canonical MrSampleBag via
    // mrSampleInventoryService.consumeSamplesFromMr (mocked below) instead of
    // a direct MrSampleStock.findOneAndUpdate, and MrSampleIssuance/
    // SampleConversion are both created with the transaction session. See
    // routes/crm/medicalReps.js.
    test('POST /api/mr-sample-stock/issue-to-doctor decrements stock and creates MrSampleIssuance and SampleConversion records', async () => {
      consumeSamplesFromMr.mockResolvedValue({ mrId: 'mr_101', productId: 'prod_101', qty: 15 });
      Product.findById.mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ price: 150, name: 'Ashwagandha Churna' })
        })
      });
      MedicalRepresentative.findById.mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'mr_101', name: 'Ramesh' })
        })
      });
      Doctor.findById.mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'doc_101', name: 'Dr. S. K. Roy' })
        })
      });
      MrSampleIssuance.create.mockImplementation(async ([data]) => [{
        _id: 'issuance_1',
        ...data
      }]);
      SampleConversion.create.mockImplementation(async ([data]) => [{
        _id: 'conversion_1',
        ...data
      }]);

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
      expect(consumeSamplesFromMr).toHaveBeenCalledWith(expect.objectContaining({
        mrId: 'mr_101',
        sampleDetails: [expect.objectContaining({ productId: 'prod_101', qty: 5 })]
      }));
      expect(MrSampleIssuance.create).toHaveBeenCalledWith(
        [expect.objectContaining({
          mrId: 'mr_101',
          doctorId: 'doc_101',
          productId: 'prod_101',
          qty: 5,
          unitCost: 150
        })],
        expect.any(Object)
      );
      expect(SampleConversion.create).toHaveBeenCalledWith(
        [expect.objectContaining({
          mrId: 'mr_101',
          doctorId: 'doc_101',
          productId: 'prod_101',
          samplesQtyGiven: 5,
          conversionStatus: 'pending'
        })],
        expect.any(Object)
      );
    });
  });

  describe('3b. Doctor ROI & MR Rollup Reports', () => {
    test('GET /api/doctors/:id/sample-roi computes total sample cost, rx revenue, and ROI ratio', async () => {
      Doctor.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'doc_101', name: 'Dr. S. K. Roy' })
      });
      SampleConversion.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
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

    test('GET /api/doctors/:id/sample-roi uses converted SampleConversion revenue when available', async () => {
      Doctor.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'doc_101', name: 'Dr. S. K. Roy' })
      });
      SampleConversion.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { conversionStatus: 'converted', prescriptionOrderAmount: 25000 }
        ])
      });
      Invoice.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'inv_1', amount: 5000 }
        ])
      });
      MrSampleIssuance.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { qty: 10, unitCost: 100 }
        ])
      });

      const res = await request(app).get('/api/doctors/doc_101/sample-roi');
      expect(res.status).toBe(200);
      expect(res.body.totalRxRevenue).toBe(25000);
      expect(res.body.totalSampleCost).toBe(1000);
      expect(res.body.roiRatio).toBe(25);
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
      SampleConversion.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
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
