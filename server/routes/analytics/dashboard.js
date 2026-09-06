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
    const [
      contactStats,
      pendingTasksCount,
      orderSalesAgg,
      activeWebOrdersCount,
      completedWebOrdersCount,
      webQueriesCount
    ] = await Promise.all([
      Contact.aggregate([
        {
          $group: {
            _id: '$stage',
            totalValue: { $sum: { $ifNull: ['$dealValue', 0] } },
            count: { $sum: 1 }
          }
        }
      ]),
      Task.countDocuments({ completed: { $ne: true } }),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalSales: { $sum: { $ifNull: ['$totalAmount', 0] } }
          }
        }
      ]),
      Order.countDocuments({ status: { $in: ['pending', 'processing'] } }),
      Order.countDocuments({ status: { $in: ['shipped', 'delivered'] } }),
      ProductQuery.countDocuments()
    ]);

    let totalPipeline = 0;
    let closedWon = 0;
    let activeLeadsCount = 0;

    for (const stat of contactStats) {
      const stage = stat._id;
      if (stage === 'won') {
        closedWon += stat.totalValue;
      } else if (stage !== 'lost') {
        totalPipeline += stat.totalValue;
      }
      if (['lead', 'contacted'].includes(stage)) {
        activeLeadsCount += stat.count;
      }
    }

    const totalWebSales = orderSalesAgg.length > 0 ? (orderSalesAgg[0].totalSales || 0) : 0;

    res.json({ 
      totalPipeline, 
      closedWon, 
      activeLeadsCount, 
      pendingTasksCount,
      totalWebSales,
      activeWebOrdersCount,
      completedWebOrdersCount,
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
