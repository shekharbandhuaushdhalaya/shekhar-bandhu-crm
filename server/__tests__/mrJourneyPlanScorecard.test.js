const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const PermanentJourneyPlan = require('../models/PermanentJourneyPlan');
const MrVisit = require('../models/MrVisit');
const medicalRepRoutes = require('../routes/crm/medicalReps');

let mongoServer;
let app;

describe('Task 3 — MR Field Force PJP & Performance Scorecard Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: new mongoose.Types.ObjectId().toString(), role: 'admin', permissions: ['mr:view', 'mr:visits', 'mr:create'] };
      next();
    });
    app.use('/api/medical-reps', medicalRepRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await MedicalRepresentative.deleteMany({});
    await PermanentJourneyPlan.deleteMany({});
    await MrVisit.deleteMany({});
  });

  it('creates PJP, matches visits, calculates adherence (2/3 = 66.7%), and returns scorecard', async () => {
    // 1. Create MR
    const mr = await MedicalRepresentative.create({
      name: 'Rajesh Sharma',
      code: 'MR-010',
      territory: 'Varanasi Central',
      phone: '9876543210'
    });

    const plannedDateStr = '2026-09-05';

    // 2. Create PJP with 3 target doctors
    const pjpRes = await request(app)
      .post(`/api/medical-reps/${mr._id}/journey-plans`)
      .send({
        plannedDate: plannedDateStr,
        targetDoctors: [
          { doctorName: 'Dr. A. K. Gupta', plannedTime: '10:00 AM' },
          { doctorName: 'Dr. S. P. Verma', plannedTime: '12:00 PM' },
          { doctorName: 'Dr. Ramesh Chandra', plannedTime: '03:00 PM' }
        ]
      });

    expect(pjpRes.status).toBe(201);
    expect(pjpRes.body.targetDoctors.length).toBe(3);

    // 3. Log 2 matching visits + 1 unplanned visit
    await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorName: 'Dr. A. K. Gupta',
        date: new Date('2026-09-05T10:15:00Z'),
        remarks: 'Discussed Ashwagandha & Shatavari'
      });

    await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorName: 'Dr. S. P. Verma',
        date: new Date('2026-09-05T12:30:00Z'),
        remarks: 'Sample bag issued'
      });

    // Unplanned visit
    await request(app)
      .post(`/api/medical-reps/${mr._id}/visits`)
      .send({
        doctorName: 'Dr. Unplanned Doctor',
        date: new Date('2026-09-05T16:00:00Z'),
        remarks: 'Introductory call'
      });

    // 4. Fetch updated PJP and assert adherence %
    const updatedPjpRes = await request(app)
      .get(`/api/medical-reps/${mr._id}/journey-plans?date=${plannedDateStr}`);

    expect(updatedPjpRes.status).toBe(200);
    expect(updatedPjpRes.body.adherencePercentage).toBe(66.7);
    expect(updatedPjpRes.body.status).toBe('partially_completed');

    // 5. Fetch Scorecard
    const scorecardRes = await request(app)
      .get(`/api/medical-reps/${mr._id}/scorecard?month=2026-09`);

    expect(scorecardRes.status).toBe(200);
    expect(scorecardRes.body.totalPlannedVisits).toBe(3);
    expect(scorecardRes.body.actualVisits).toBe(3);
    expect(scorecardRes.body.matchedPjpVisits).toBe(2);
    expect(scorecardRes.body.adherencePercentage).toBe(66.7);
  });
});
