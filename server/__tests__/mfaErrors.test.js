const express = require('express');
const request = require('supertest');
const User = require('../models/User');

jest.mock('../middleware/authenticateJWT', () => ({
  authenticateJWT: (req, res, next) => { req.user = { id: '507f1f77bcf86cd799439011', name: 'Admin', role: 'admin', firmRole: 'admin', firmId: '507f1f77bcf86cd799439012' }; next(); },
}));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/config', () => ({ jwtSecret: 'test-secret', accessTokenTtl: '15m', refreshTokenTtlDays: 30 }));
jest.mock('speakeasy', () => ({ generateSecret: jest.fn(), totp: { verify: jest.fn() } }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ verify: jest.fn(() => ({ id: '507f1f77bcf86cd799439011', mfaPending: true })), sign: jest.fn(() => 'access-token') }));
jest.mock('../models/UserFirm', () => ({ findOne: jest.fn() }));
jest.mock('../models/RefreshSession', () => ({ create: jest.fn() }));
jest.mock('../middleware/authorize', () => ({ getRolePermissions: jest.fn().mockResolvedValue(['*']) }));
jest.mock('../utils/permissions', () => ({ hasPermission: jest.fn() }));

const mfaRoutes = require('../routes/auth/mfa');

describe('MFA route error responses', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth/mfa', mfaRoutes);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not expose storage errors from MFA setup', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => Promise.reject(new Error('private database host details')),
    });

    const res = await request(app).post('/api/auth/mfa/setup');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to start MFA setup');
    expect(res.body.error).not.toContain('database host');
  });

  it('does not expose storage errors from MFA setup verification', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => Promise.reject(new Error('private user store credentials')),
    });

    const res = await request(app).post('/api/auth/mfa/verify-setup').send({ token: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to verify MFA setup');
    expect(res.body.error).not.toContain('credentials');
  });

  it('does not expose storage errors from MFA login verification', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => Promise.reject(new Error('private MFA database topology')),
    });

    const res = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: 'valid-token', totpCode: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to complete MFA login');
    expect(res.body.error).not.toContain('database topology');
  });

  it('does not expose storage errors from self-service MFA disable', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => Promise.reject(new Error('private user database endpoint')),
    });

    const res = await request(app).post('/api/auth/mfa/disable').send({ password: 'password', totpCode: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to disable MFA');
    expect(res.body.error).not.toContain('database endpoint');
  });

  it('does not expose storage errors from administrator MFA disable', async () => {
    jest.spyOn(User, 'findById').mockReturnValue({
      select: () => Promise.reject(new Error('private admin database endpoint')),
    });

    const res = await request(app).put('/api/auth/mfa/admin-disable/507f1f77bcf86cd799439013');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to disable MFA for user');
    expect(res.body.error).not.toContain('database endpoint');
  });
});
