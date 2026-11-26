const express = require('express');
const request = require('supertest');
const Otp = require('../models/Otp');

jest.mock('../models/User', () => ({ exists: jest.fn(), findOne: jest.fn(), findById: jest.fn(), updateOne: jest.fn(), create: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/Firm', () => ({ create: jest.fn() }));
jest.mock('../models/UserFirm', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/RefreshSession', () => ({ create: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), find: jest.fn() }));
jest.mock('../models/Otp', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../utils/agentTracker', () => ({ trackAgentActivity: jest.fn() }));
jest.mock('../middleware/authorize', () => ({ authorize: () => (req, res, next) => next(), getRolePermissions: jest.fn() }));
jest.mock('../middleware/idempotency', () => (req, res, next) => next());
jest.mock('../middleware/validate', () => ({ validate: () => (req, res, next) => next() }));
jest.mock('../validation/schemas', () => ({ userSchema: {}, loginSchema: {}, updateProfileSchema: {}, changePasswordSchema: {} }));
jest.mock('../middleware/authenticateJWT', () => ({ authenticateJWT: (req, res, next) => next() }));
jest.mock('../utils/whatsappService', () => ({ sendWhatsAppNotification: jest.fn() }));
jest.mock('../src/config', () => ({ jwtSecret: 'test-secret', isProduction: false, refreshTokenTtlDays: 30, accessTokenTtl: '15m', twilio: {} }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'token'), verify: jest.fn() }));
jest.mock('bcryptjs', () => ({ genSalt: jest.fn(), hash: jest.fn(), compare: jest.fn() }));
jest.mock('../services/jobQueue', () => ({ registerJobHandler: jest.fn() }));

const { router } = require('../routes/auth/auth');

describe('authentication route error responses', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });

  afterEach(() => jest.clearAllMocks());

  it('does not expose OTP storage errors from WhatsApp verification', async () => {
    Otp.findOne.mockRejectedValue(new Error('private OTP database connection details'));

    const res = await request(app)
      .post('/api/auth/whatsapp/verify-otp')
      .send({ phone: '+919876543210', code: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to complete authentication request');
    expect(res.body.error).not.toContain('database connection');
  });
});
