const express = require('express');
const request = require('supertest');
const ProductQuery = require('../models/ProductQuery');

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => next(),
}));
jest.mock('../middleware/idempotency', () => (req, res, next) => next());

const queryRoutes = require('../routes/system/queries');

describe('system query API error responses', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/queries', queryRoutes);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not expose database errors when listing queries fails', async () => {
    jest.spyOn(ProductQuery, 'find').mockReturnValue({
      sort: () => ({ lean: () => Promise.reject(new Error('private database connection details')) }),
    });

    const res = await request(app).get('/api/queries');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to retrieve queries');
    expect(res.body.error).not.toContain('private database');
  });

  it('does not expose database errors when updating query status fails', async () => {
    jest.spyOn(ProductQuery, 'findByIdAndUpdate')
      .mockRejectedValue(new Error('internal write concern details'));

    const res = await request(app)
      .patch('/api/queries/507f1f77bcf86cd799439011/status')
      .send({ status: 'contacted' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to update query status');
    expect(res.body.error).not.toContain('write concern');
  });

  it('does not expose database errors when converting a query to a lead fails', async () => {
    jest.spyOn(ProductQuery, 'findById')
      .mockRejectedValue(new Error('internal query lookup details'));

    const res = await request(app)
      .post('/api/queries/507f1f77bcf86cd799439011/convert')
      .send({ customerName: 'Test Customer' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to convert query to lead');
    expect(res.body.error).not.toContain('query lookup');
  });
});
