const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const Contact = require('../models/Contact');
const Customer = require('../models/Customer');
const MrDailyLog = require('../models/MrDailyLog');
const MrVisit = require('../models/MrVisit');
const medicalRepRoutes = require('../routes/crm/medicalReps');

let mongoServer;
let app;
let currentUser = { id: 'admin1', role: 'admin', email: 'admin@company.com' };

describe('MR Doctor Assignment, Day Turns, GPS Footprints & Access Control', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    // Dynamic user authorization middleware for testing access control
    app.use((req, res, next) => {
      req.user = currentUser;
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
    await Contact.deleteMany({});
    await Customer.deleteMany({});
    await MrDailyLog.deleteMany({});
    await MrVisit.deleteMany({});
    currentUser = { id: 'admin1', role: 'admin', email: 'admin@company.com' };
  });

  it('assigns doctors to MR with area name & turn day', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Rohan Sharma',
      email: 'rohan.mr@company.com',
      phone: '9876543210',
      code: 'MR-101',
      territory: 'Lanka Varanasi'
    });

    const doc1 = await Contact.create({
      name: 'Dr. Amit Patel',
      company: 'Patel Clinic',
      phone: '9876543210'
    });

    const doc2 = await Customer.create({
      name: 'Dr. Sunita Rao',
      company: 'Rao Medicos',
      phone: '9123456789'
    });

    const assignRes = await request(app)
      .post('/api/medical-reps/assign-doctors')
      .send({
        mrId: mr._id.toString(),
        contactIds: [doc1._id.toString()],
        customerIds: [doc2._id.toString()],
        areaName: 'Lanka Market',
        preferredVisitDay: 'Monday'
      });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.totalAssigned).toBe(2);

    const updatedDoc1 = await Contact.findById(doc1._id);
    expect(updatedDoc1.assignedMrId.toString()).toBe(mr._id.toString());
    expect(updatedDoc1.areaName).toBe('Lanka Market');
    expect(updatedDoc1.preferredVisitDay).toBe('Monday');

    const updatedDoc2 = await Customer.findById(doc2._id);
    expect(updatedDoc2.assignedMrId.toString()).toBe(mr._id.toString());
    expect(updatedDoc2.preferredVisitDay).toBe('Monday');
  });

  it('fetches MR assigned doctors filtered by turn day', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Rohan Sharma',
      email: 'rohan.mr@company.com',
      phone: '9876543210',
      code: 'MR-101'
    });

    await Contact.create({
      name: 'Dr. Monday Doctor',
      assignedMrId: mr._id,
      areaName: 'Zone A',
      preferredVisitDay: 'Monday'
    });

    await Contact.create({
      name: 'Dr. Tuesday Doctor',
      assignedMrId: mr._id,
      areaName: 'Zone B',
      preferredVisitDay: 'Tuesday'
    });

    const res = await request(app)
      .get(`/api/medical-reps/${mr._id}/assigned-doctors?dayOfWeek=Monday`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Dr. Monday Doctor');
  });

  it('records sequential GPS location pings and calculates cumulative distance', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Rohan Sharma',
      email: 'rohan.mr@company.com',
      phone: '9876543210',
      code: 'MR-101'
    });

    // Ping 1
    const p1 = await request(app)
      .post(`/api/medical-reps/${mr._id}/location-ping`)
      .send({ latitude: 25.3176, longitude: 82.9739, speed: 10, accuracy: 5 });

    expect(p1.status).toBe(200);
    expect(p1.body.totalPings).toBe(1);

    // Ping 2 (~1.5 km away)
    const p2 = await request(app)
      .post(`/api/medical-reps/${mr._id}/location-ping`)
      .send({ latitude: 25.3300, longitude: 82.9800, speed: 25, accuracy: 5 });

    expect(p2.status).toBe(200);
    expect(p2.body.totalPings).toBe(2);
    expect(p2.body.gpsDistance).toBeGreaterThan(0);
  });

  it('generates footprint trail report with breadcrumbs, visits and verified clinic status', async () => {
    const mr = await MedicalRepresentative.create({
      name: 'Rohan Sharma',
      email: 'rohan.mr@company.com',
      phone: '9876543210',
      code: 'MR-101'
    });

    // Ping locations
    await request(app)
      .post(`/api/medical-reps/${mr._id}/location-ping`)
      .send({ latitude: 25.3176, longitude: 82.9739 });

    const todayStr = new Date().toISOString().split('T')[0];

    const trailRes = await request(app)
      .get(`/api/medical-reps/${mr._id}/footprint-trail?date=${todayStr}`);

    expect(trailRes.status).toBe(200);
    expect(trailRes.body.mrName).toBe('Rohan Sharma');
    expect(trailRes.body.breadcrumbs.length).toBe(1);
    expect(trailRes.body.plannedDoctorsCount).toBeDefined();
  });

  it('enforces MR self-scoping (MR can access own data, forbidden for other MR data)', async () => {
    const mr1 = await MedicalRepresentative.create({
      name: 'MR One',
      email: 'mr1@company.com',
      phone: '9876543211',
      code: 'MR-001'
    });

    const mr2 = await MedicalRepresentative.create({
      name: 'MR Two',
      email: 'mr2@company.com',
      phone: '9876543212',
      code: 'MR-002'
    });

    // 1. Authenticated as MR 1 attempting to view MR 1 data -> ALLOWED (200)
    currentUser = { id: 'user1', role: 'mr', email: 'mr1@company.com' };
    const ownRes = await request(app).get(`/api/medical-reps/${mr1._id}/assigned-doctors`);
    expect(ownRes.status).toBe(200);

    // 2. Authenticated as MR 1 attempting to view MR 2 data -> FORBIDDEN (403)
    const otherRes = await request(app).get(`/api/medical-reps/${mr2._id}/assigned-doctors`);
    expect(otherRes.status).toBe(403);
    expect(otherRes.body.error).toContain('Access denied');

    // 3. Authenticated as MR 1 attempting to ping location for MR 2 -> FORBIDDEN (403)
    const otherPingRes = await request(app)
      .post(`/api/medical-reps/${mr2._id}/location-ping`)
      .send({ latitude: 25.3176, longitude: 82.9739 });
    expect(otherPingRes.status).toBe(403);

    // 4. Authenticated as Admin viewing MR 2 data -> ALLOWED (200)
    currentUser = { id: 'admin1', role: 'admin', email: 'admin@company.com' };
    const adminRes = await request(app).get(`/api/medical-reps/${mr2._id}/assigned-doctors`);
    expect(adminRes.status).toBe(200);
  });
});
