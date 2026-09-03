const express = require('express');
const Product = require('../../models/Product');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/analytics/demand-forecasting — Moving average demand forecast per product
router.get('/', authorize('report:view'), async (req, res) => {
  try {
    const products = await Product.find({}).select('name sku price stockLevel minReorderLevel').lean();
    const now = new Date();

    // 3 Months window
    const m3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: m3Start }
    }).select('items date').lean();

    // Sum product sales over last 3 months
    const productSalesMap = new Map();

    for (const inv of invoices) {
      for (const item of inv.items || []) {
        const pId = item.productId ? item.productId.toString() : null;
        if (!pId) continue;
        const qty = item.qty || item.boxes || 0;
        productSalesMap.set(pId, (productSalesMap.get(pId) || 0) + qty);
      }
    }

    const forecastResults = products.map(p => {
      const total3MUnits = productSalesMap.get(p._id.toString()) || 0;
      const avgMonthlyDemand = Number((total3MUnits / 3).toFixed(1));
      const projectedNextMonthUnits = Math.ceil(avgMonthlyDemand * 1.1); // 10% seasonal growth buffer
      const currentStockBoxes = p.stockLevel || 0;
      const reorderNeeded = currentStockBoxes < projectedNextMonthUnits;

      return {
        productId: p._id,
        productName: p.name,
        sku: p.sku || 'N/A',
        currentStockBoxes,
        past3MonthsTotalSalesUnits: total3MUnits,
        monthlyMovingAverageDemandUnits: avgMonthlyDemand,
        projectedNextMonthDemandUnits: projectedNextMonthUnits,
        reorderRecommended: reorderNeeded,
        recommendedReorderQty: reorderNeeded ? Math.max(0, projectedNextMonthUnits - currentStockBoxes) : 0
      };
    });

    res.json(forecastResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
