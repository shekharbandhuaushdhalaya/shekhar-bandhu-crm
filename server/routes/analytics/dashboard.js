const express = require('express');
const Contact = require('../../models/Contact');
const Task = require('../../models/Task');
const Activity = require('../../models/Activity');
const Order = require('../../models/Order');
const ProductQuery = require('../../models/ProductQuery');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/dashboard/stats — aggregate pipeline metrics & e-commerce stats
router.get('/stats', authorize('analytics:query'), async (req, res) => {
  try {
    const contacts = await Contact.find().lean();
    const tasks = await Task.find().lean();

    const totalPipeline = contacts
      .filter(c => !['won', 'lost'].includes(c.stage))
      .reduce((sum, c) => sum + c.dealValue, 0);

    const closedWon = contacts
      .filter(c => c.stage === 'won')
      .reduce((sum, c) => sum + c.dealValue, 0);

    const activeLeadsCount = contacts
      .filter(c => ['lead', 'contacted'].includes(c.stage))
      .length;

    const pendingTasksCount = tasks.filter(t => !t.completed).length;

    // E-Commerce Stats
    const activeOrders = await Order.find({ status: { $in: ['pending', 'processing'] } }).lean();
    const completedOrders = await Order.find({ status: { $in: ['shipped', 'delivered'] } }).lean();
    const allWebOrders = await Order.find().lean();
    const totalWebSales = allWebOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const webQueriesCount = await ProductQuery.countDocuments();

    res.json({ 
      totalPipeline, 
      closedWon, 
      activeLeadsCount, 
      pendingTasksCount,
      totalWebSales,
      activeWebOrdersCount: activeOrders.length,
      completedWebOrdersCount: completedOrders.length,
      webQueriesCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/activities — recent activities
router.get('/activities', authorize('analytics:query'), async (req, res) => {
  try {
    const activities = await Activity.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json(activities.map(a => ({
      _id: a._id,
      type: a.type,
      text: a.text,
      date: a.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
