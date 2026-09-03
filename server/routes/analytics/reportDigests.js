const express = require('express');
const Invoice = require('../../models/Invoice');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/analytics/digests/daily-sales — Generate formatted text for daily sales & inventory digest
router.get('/daily-sales', authorize('report:view'), async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: todayStart }
    }).lean();

    const orders = await Order.find({
      createdAt: { $gte: todayStart }
    }).lean();

    const totalRevenueToday = invoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);
    const lowStockCount = await Product.countDocuments({ stockLevel: { $lte: 10 } });

    const digestText = `📊 *Daily Executive Sales Digest — ${new Date().toLocaleDateString('en-IN')}*\n\n` +
      `• *Total Sales Revenue Today*: ₹${totalRevenueToday.toLocaleString('en-IN')}\n` +
      `• *Invoices Issued*: ${invoices.length}\n` +
      `• *New Orders Placed*: ${orders.length}\n` +
      `• *Low Stock Alerts*: ${lowStockCount} products\n\n` +
      `_Generated automatically by Shekhar Bandhu CRM System_`;

    res.json({
      date: todayStart,
      totalRevenueToday,
      invoicesCount: invoices.length,
      ordersCount: orders.length,
      lowStockCount,
      digestText
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
