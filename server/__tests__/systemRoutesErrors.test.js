const express = require('express');
const request = require('supertest');
const SystemSettings = require('../models/SystemSettings');
const AuditLog = require('../models/AuditLog');

jest.mock('../routes/auth/auth', () => ({
  authenticateToken: (req, res, next) => { req.user = { name: 'Test User' }; next(); },
}));
jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => next(),
}));
jest.mock('../middleware/publicTenant', () => ({
  publicTenant: (req, res, next) => next(),
}));
jest.mock('cloudinary', () => ({
  v2: { config: jest.fn(), uploader: { upload_stream: jest.fn() } },
}));

const systemRoutes = require('../routes/system/system');

describe('system route error responses', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/system', systemRoutes);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not expose database details from authenticated settings retrieval', async () => {
    jest.spyOn(SystemSettings, 'findOneAndUpdate').mockReturnValue({
      lean: () => Promise.reject(new Error('private MongoDB host and credentials')),
    });

    const res = await request(app).get('/api/system/settings');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to retrieve system settings');
    expect(res.body.error).not.toContain('MongoDB');
  });

  it('does not expose database details from public company settings retrieval', async () => {
    jest.spyOn(SystemSettings, 'findOneAndUpdate').mockReturnValue({
      lean: () => Promise.reject(new Error('private database topology')),
    });

    const res = await request(app).get('/api/system/settings/public');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to retrieve public company settings');
    expect(res.body.error).not.toContain('database topology');
  });

  it('does not expose database details from audit log retrieval', async () => {
    jest.spyOn(AuditLog, 'find').mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: () => Promise.reject(new Error('private audit store endpoint')),
          }),
        }),
      }),
    });

    const res = await request(app).get('/api/system/audit-logs');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to retrieve audit logs');
    expect(res.body.error).not.toContain('audit store endpoint');
  });
});
