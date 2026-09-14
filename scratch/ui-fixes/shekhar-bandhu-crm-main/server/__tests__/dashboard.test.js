const request = require('supertest');
const express = require('express');
const dashboardRouter = require('../routes/analytics/dashboard');
const Contact = require('../models/Contact');
const Task = require('../models/Task');
const Order = require('../models/Order');
const ProductQuery = require('../models/ProductQuery');
const Activity = require('../models/Activity');
const RolePermission = require('../models/RolePermission');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { id: 'test-user', role: 'admin', permissions: ['analytics:query'] };
  next();
});
app.use('/api/dashboard', dashboardRouter);

describe('Dashboard Analytics Aggregation API', () => {
  beforeEach(() => {
    jest.spyOn(RolePermission, 'getEffectivePermissions').mockResolvedValue({ permissions: ['*'] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET /api/dashboard/stats returns accurate aggregated metrics via Mongoose aggregation', async () => {
    jest.spyOn(Contact, 'aggregate').mockResolvedValue([
      { _id: 'lead', totalValue: 5000, count: 1 },
      { _id: 'contacted', totalValue: 10000, count: 1 },
      { _id: 'won', totalValue: 50000, count: 1 },
      { _id: 'lost', totalValue: 20000, count: 1 },
    ]);

    jest.spyOn(Task, 'countDocuments').mockResolvedValue(1);

    jest.spyOn(Order, 'aggregate').mockResolvedValue([
      { _id: null, totalSales: 5000 }
    ]);

    jest.spyOn(Order, 'countDocuments')
      .mockResolvedValueOnce(1)  // active
      .mockResolvedValueOnce(1); // completed

    jest.spyOn(ProductQuery, 'countDocuments').mockResolvedValue(1);

    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalPipeline: 15000,
      closedWon: 50000,
      activeLeadsCount: 2,
      pendingTasksCount: 1,
      totalWebSales: 5000,
      activeWebOrdersCount: 1,
      completedWebOrdersCount: 1,
      webQueriesCount: 1,
    });

    expect(Contact.aggregate).toHaveBeenCalled();
    expect(Order.aggregate).toHaveBeenCalled();
    expect(Task.countDocuments).toHaveBeenCalledWith({ completed: { $ne: true } });
  }, 15000);

  it('GET /api/dashboard/activities returns sorted recent activities with bounded limit', async () => {
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'act_1', type: 'note', text: 'Activity 1', createdAt: new Date() },
        { _id: 'act_2', type: 'call', text: 'Activity 2', createdAt: new Date() }
      ])
    };
    jest.spyOn(Activity, 'find').mockReturnValue(mockQuery);

    const res = await request(app).get('/api/dashboard/activities');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(mockQuery.limit).toHaveBeenCalledWith(20);
  }, 15000);
});
