const request = require('supertest');
const express = require('express');
const mrIncentivesRouter = require('../routes/crm/mrIncentives');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const SalesTarget = require('../models/SalesTarget');
const Invoice = require('../models/Invoice');
const MrVisit = require('../models/MrVisit');
const Contact = require('../models/Contact');
const Customer = require('../models/Customer');

jest.mock('../models/MedicalRepresentative');
jest.mock('../models/SalesTarget');
jest.mock('../models/Invoice');
jest.mock('../models/MrVisit');
jest.mock('../models/Contact');
jest.mock('../models/Customer');

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: 'usr1', name: 'Sales Director', role: 'admin', permissions: ['mr:view'] };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/mr-incentives', mrIncentivesRouter);

describe('Module 3: Analytics & MR Performance Incentives', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/mr-incentives/:mrId/scorecard', () => {
    test('calculates real-time coverage %, sample conversion %, and estimated commission payout', async () => {
      MedicalRepresentative.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'mr101', name: 'Rohan Sharma' })
      });
      Contact.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }])
      });
      Customer.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });
      MrVisit.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'v1', doctorId: 'c1', samplesGiven: [{ productName: 'Abhaya', qty: 1 }] },
          { _id: 'v2', doctorId: 'c2', samplesGiven: [] }
        ])
      });
      Invoice.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ nettTotal: 120000 }])
      });
      SalesTarget.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ targetAmount: 100000 })
      });

      const res = await request(app).get('/api/mr-incentives/mr101/scorecard?month=9&year=2026');

      expect(res.status).toBe(200);
      expect(res.body.mrName).toBe('Rohan Sharma');
      expect(res.body.doctorCoveragePercent).toBe(100);
      expect(res.body.sampleConversionPercent).toBe(50);
      expect(res.body.achievementPercent).toBe(120);
      expect(res.body.commissionPercent).toBe(5);
      expect(res.body.estimatedPayout).toBe(6000);
    });
  });

  describe('GET /api/mr-incentives/leaderboard', () => {
    test('ranks MRs by composite sales & coverage score with rank badges', async () => {
      MedicalRepresentative.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'mr1', name: 'Amit Kumar', headquarter: 'Varanasi' },
          { _id: 'mr2', name: 'Priya Singh', headquarter: 'Lucknow' }
        ])
      });
      Contact.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'c1' }])
      });
      MrVisit.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'v1' }])
      });
      Invoice.find
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue([{ nettTotal: 250000 }]) })
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue([{ nettTotal: 100000 }]) });

      const res = await request(app).get('/api/mr-incentives/leaderboard?month=9&year=2026');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].rank).toBe(1);
      expect(res.body[0].badge).toContain('Gold');
      expect(res.body[0].mrName).toBe('Amit Kumar');
    });
  });
});
