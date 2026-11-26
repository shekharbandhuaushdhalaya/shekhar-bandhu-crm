const express = require('express');
const request = require('supertest');
const fs = require('fs');
const ProductQuery = require('../models/ProductQuery');

jest.mock('../models/ProductQuery', () => ({
  create: jest.fn(),
}));

const publicQueryRoutes = require('../routes/public/queries');

describe('public inquiry submission contract', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/public/queries', publicQueryRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('accepts the fields consumed by the public inquiry handler', async () => {
    const saved = { _id: '507f1f77bcf86cd799439011', name: 'Test User' };
    ProductQuery.create.mockResolvedValue(saved);

    const response = await request(app)
      .post('/api/public/queries/submit')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        phone: '9876543210',
        productName: 'Herbal Tonic',
        productId: '507f1f77bcf86cd799439012',
        query: 'Please share wholesale pricing',
      });

    expect(response.status).toBe(201);
    expect(ProductQuery.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test User',
      email: 'test@example.com',
      phone: '9876543210',
      productName: 'Herbal Tonic',
      productId: '507f1f77bcf86cd799439012',
      query: 'Please share wholesale pricing',
    }));
  });

  it('rejects a missing required inquiry field before creating a record', async () => {
    const response = await request(app)
      .post('/api/public/queries/submit')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        phone: '9876543210',
        productName: 'Herbal Tonic',
      });

    expect(response.status).toBe(400);
    expect(ProductQuery.create).not.toHaveBeenCalled();
  });

  it('removes an uploaded image when inquiry validation fails', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockImplementation((_path, callback) => callback(null));

    const response = await request(app)
      .post('/api/public/queries/submit')
      .field('name', 'Test User')
      .field('email', 'test@example.com')
      .field('phone', '9876543210')
      .attach('image', Buffer.from('test image'), { filename: 'query.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('query-'), expect.any(Function));
    expect(ProductQuery.create).not.toHaveBeenCalled();
  });
});
