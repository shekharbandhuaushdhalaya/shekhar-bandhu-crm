process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_critical_jwt_secret_key';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const SystemSettings = require('../models/SystemSettings');
const systemRoutes = require('../routes/system/system');

let mongoServer;
let app;
const TEST_JWT_SECRET = process.env.JWT_SECRET;

describe('Critical Security Audits (Item 1 & Item 2)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use('/api/system', systemRoutes);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await SystemSettings.deleteMany({});
    await SystemSettings.create({
      key: 'company_config',
      firmName: 'SHEKHAR BANDHU AUSHADHALAYA',
      razorpayKeySecret: 'secret_rzp_live_12345',
      razorpayWebhookSecret: 'secret_wh_live_67890',
      geminiApiKey: 'secret_gemini_ai_99999'
    });
  });

  describe('Item 1: GET /api/system/settings protection and secret masking', () => {
    it('rejects unauthenticated GET /api/system/settings with 401', async () => {
      const res = await request(app).get('/api/system/settings');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('allows GET /api/system/settings/public without token but excludes secrets', async () => {
      const res = await request(app).get('/api/system/settings/public');
      expect(res.status).toBe(200);
      expect(res.body.firmName).toBe('SHEKHAR BANDHU AUSHADHALAYA');
      expect(res.body.razorpayKeySecret).toBeUndefined();
      expect(res.body.razorpayWebhookSecret).toBeUndefined();
      expect(res.body.geminiApiKey).toBeUndefined();
    });

    it('authenticated GET /api/system/settings excludes razorpayKeySecret, razorpayWebhookSecret, and geminiApiKey', async () => {
      const validUserId = new mongoose.Types.ObjectId().toString();
      const token = jwt.sign({ id: validUserId, name: 'Admin', role: 'admin' }, TEST_JWT_SECRET);
      const res = await request(app)
        .get('/api/system/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.firmName).toBe('SHEKHAR BANDHU AUSHADHALAYA');
      expect(res.body.razorpayKeySecret).toBeUndefined();
      expect(res.body.razorpayWebhookSecret).toBeUndefined();
      expect(res.body.geminiApiKey).toBeUndefined();
    });
  });

  describe('Item 2: Hardcoded fallback JWT secret elimination', () => {
    it('ensures config.jwtSecret has no hardcoded fallback when JWT_SECRET is unset or empty', () => {
      const savedEnv = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      jest.resetModules();
      const freshConfig = require('../src/config');
      expect(freshConfig.jwtSecret).toBeFalsy();

      process.env.JWT_SECRET = savedEnv;
      jest.resetModules();
    });
  });
});
