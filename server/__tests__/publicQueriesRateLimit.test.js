const express = require('express');
const request = require('supertest');
const ProductQuery = require('../models/ProductQuery');

jest.mock('../models/ProductQuery', () => ({
  create: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
}));

const publicQueryRoutes = require('../routes/public/queries');

describe('public inquiry rate limiting', () => {
  const app = express();

  beforeAll(() => {
    app.use(express.json());
    app.use('/api/public/queries', publicQueryRoutes);
  });

  it('limits repeated anonymous inquiry submissions per IP', async () => {
    const responses = [];
    for (let i = 0; i < 11; i += 1) {
      responses.push(await request(app)
        .post('/api/public/queries/submit')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          phone: '9876543210',
          productName: 'Herbal Tonic',
          query: 'Please share wholesale pricing',
        }));
    }

    expect(responses.slice(0, 10).every(response => response.status === 201)).toBe(true);
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toMatch(/too many inquiries/i);
    expect(ProductQuery.create).toHaveBeenCalledTimes(10);
  });
});
