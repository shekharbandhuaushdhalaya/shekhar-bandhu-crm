const request = require('supertest');
const express = require('express');
const medicalRepsRouter = require('../routes/crm/medicalReps');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const MrVisit = require('../models/MrVisit');
const Doctor = require('../models/Doctor');

jest.mock('../models/MedicalRepresentative');
jest.mock('../models/MrVisit');
jest.mock('../models/Doctor');
jest.mock('../models/MrDailyLog', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../models/MrSampleBag', () => ({
  findOne: jest.fn(),
}));

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: 'usr1', _id: 'usr1', role: 'mr', mrId: 'mr101', permissions: ['mr:view', 'mr:visit'] };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/medical-reps', medicalRepsRouter);

describe('Module 1: AI & Intelligent Field Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/medical-reps/:mrId/optimize-route', () => {
    test('clusters assigned doctors by priority tier & generates optimized itinerary', async () => {
      Doctor.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'c1', name: 'Dr. Sharma', category: 'B', preferredVisitDay: 'Monday', latitude: 25.31, longitude: 82.97 },
          { _id: 'c2', name: 'Dr. Gupta (Key KOL)', category: 'A', preferredVisitDay: 'Monday', latitude: 25.32, longitude: 82.98 }
        ])
      });

      const res = await request(app)
        .post('/api/medical-reps/mr101/optimize-route')
        .send({ dayOfWeek: 'Monday', currentLat: 25.30, currentLng: 82.95 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalDoctorsPlanned).toBe(2);
      expect(res.body.itinerary).toHaveLength(2);
      expect(res.body.itinerary[0].doctorName).toContain('Dr. Gupta');
    });

    test('returns 403 when MR tries to optimize route for another MR', async () => {
      MedicalRepresentative.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'mr101', email: 'mr101@crm.com' })
      });

      const res = await request(app)
        .post('/api/medical-reps/mr999/optimize-route')
        .send({ dayOfWeek: 'Monday' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });
  });

  describe('POST /api/medical-reps/visits/:visitId/send-summary-whatsapp', () => {
    test('dispatches post-visit e-brochure & sample handover receipt message', async () => {
      MrVisit.findById.mockResolvedValue({
        _id: 'v101',
        mrId: 'mr101',
        doctorName: 'Dr. Verma',
        mrName: 'Vikram Singh',
        samplesGiven: [{ productName: 'Abhayarishta', qty: 2 }],
      });

      const res = await request(app)
        .post('/api/medical-reps/visits/v101/send-summary-whatsapp')
        .send({ doctorPhone: '9876543210' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('dispatched');
      expect(res.body.messageText).toContain('Dr. Verma');
      expect(res.body.messageText).toContain('Abhayarishta');
    });
  });
});
