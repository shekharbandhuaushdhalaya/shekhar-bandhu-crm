const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Job = require('../models/Job');
const { enqueue, registerJobHandler, processOne } = require('../services/jobQueue');
const { getFirmId } = require('../utils/tenantContext');

let mongoServer;

describe('tenant-scoped background jobs', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('requires a firm when enqueueing a tenant-scoped job', async () => {
    await expect(enqueue('test.tenant-job', {})).rejects.toThrow('Tenant-scoped jobs require a firmId');
  });

  it('marks legacy jobs without a firm dead without invoking their handler', async () => {
    const handler = jest.fn();
    registerJobHandler('test.legacy-job', handler);
    const job = await Job.create({ type: 'test.legacy-job', firmId: null, status: 'queued' });

    expect(await processOne()).toBe(true);

    const updated = await Job.findById(job._id).lean();
    expect(updated.status).toBe('dead');
    expect(updated.lastError).toBe('Tenant-scoped job is missing firmId');
    expect(updated.lockedAt).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it('executes a valid job inside its firm tenant context', async () => {
    const firmId = new mongoose.Types.ObjectId();
    let observedFirmId = null;
    registerJobHandler('test.firm-job', async () => {
      observedFirmId = getFirmId();
      return { ok: true };
    });
    await enqueue('test.firm-job', {}, { firmId });

    expect(await processOne()).toBe(true);
    expect(String(observedFirmId)).toBe(String(firmId));
    const completed = await Job.findOne({ type: 'test.firm-job' }).lean();
    expect(completed.status).toBe('completed');
    expect(completed.result).toEqual({ ok: true });
  });
});
