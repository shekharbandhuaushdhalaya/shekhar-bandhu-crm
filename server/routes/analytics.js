const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Import models
const Invoice = require('../models/Invoice');
const InventoryEntry = require('../models/InventoryEntry');
const Customer = require('../models/Customer');

// Initialize Gemini
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

router.get('/query', async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
    if (req.user && req.user.role === 'agent') {
      const sensitiveKeywords = ['profit', 'purchase', 'vendor', 'margin', 'cost', 'revenue', 'sale'];
      if (sensitiveKeywords.some(keyword => query.includes(keyword))) {
        return res.status(403).json({ error: 'Access denied: Agents cannot query financial or vendor metrics.' });
      }
    }
    let type = 'text';
    let formattedData = [];
    let dbContextStr = '';

    // Intent: Sales or Revenue
    if (query.includes('sale') || query.includes('revenue') || query.includes('profit')) {
      const matchQuery = { status: { $ne: 'Cancelled' }, type: 'sale' };
      const sales = await Invoice.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: { $dateFromString: { dateString: "$date" } } },
              month: { $month: { $dateFromString: { dateString: "$date" } } }
            },
            totalRevenue: { $sum: "$amount" },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $limit: 5 }
      ]);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      formattedData = sales.map(s => ({
        month: `${monthNames[s._id.month - 1]} ${s._id.year}`,
        revenue: `₹${s.totalRevenue.toLocaleString('en-IN')}`,
        orders: s.orderCount
      })).reverse();
      
      type = 'table';
      dbContextStr = `Sales Data Context: ${JSON.stringify(formattedData)}`;
    }
    // Intent: Top Products / Inventory
    else if (query.includes('top') || query.includes('product') || query.includes('inventory') || query.includes('stock') || query.includes('warehouse')) {
      const matchStage = {};
      if (query.includes('patna')) matchStage.warehouseName = { $regex: /patna/i };
      else if (query.includes('varanasi')) matchStage.warehouseName = { $regex: /varanasi/i };
      else if (query.includes('lohatiya')) matchStage.warehouseName = { $regex: /lohatiya/i };

      const inventory = await InventoryEntry.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$productId",
            productType: { $first: "$productType" },
            size: { $first: "$size" },
            colour: { $first: "$colour" },
            shape: { $first: "$shape" },
            weight: { $first: "$weight" },
            totalStock: { $sum: "$qtyBoxes" }
          }
        },
        { $sort: { totalStock: -1 } },
        { $limit: 5 }
      ]);
      const formatItemName = (i) => [i.size, i.shape, i.colour, i.weight].filter(Boolean).join(' ') || i.productType || 'Unnamed Product';
      formattedData = inventory.map((item, idx) => ({
        rank: idx + 1,
        product: formatItemName(item),
        stock: `${item.totalStock} boxes`
      }));
      
      type = 'table';
      dbContextStr = `Inventory Top Items Context: ${JSON.stringify(formattedData)}`;
    }
    // Intent: Customers / Outstanding
    else if (query.includes('customer') || query.includes('outstanding') || query.includes('balance') || query.includes('due')) {
      const customers = await Customer.aggregate([
        {
          $project: {
            name: 1,
            company: 1,
            totalOutstanding: { $add: ["$pakkaBalance", "$kachhaBalance"] }
          }
        },
        { $sort: { totalOutstanding: -1 } },
        { $limit: 5 }
      ]);
      formattedData = customers.map(c => ({
        customer: c.company || c.name || 'Unknown',
        outstanding: `₹${c.totalOutstanding.toLocaleString('en-IN')}`
      }));
      
      type = 'table';
      dbContextStr = `Outstanding Customers Context: ${JSON.stringify(formattedData)}`;
    }
    else {
      dbContextStr = `General Context: The user is asking a general question about their CRM. If you don't know the answer, ask them to ask about sales, inventory, or customers.`;
    }

    // Call Gemini
    let aiText = '';
    if (genAI) {
      // Using gemini-2.5-flash since 1.5 is deprecated for this key
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are APEX CRM's friendly AI Assistant. 
The user is a small business owner using your software. Answer their question concisely and professionally.
If there is data context provided, reference it to give a helpful, accurate summary of what the data shows in 1-3 sentences. Do not hallucinate data. Do not use markdown tables, just text.

User Question: "${query}"

${dbContextStr}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      aiText = response.text();
    } else {
      aiText = "API Key for AI is missing, but here is the data we found based on your request:";
    }

    return res.json({
      type: type,
      text: aiText,
      data: formattedData.length > 0 ? formattedData : undefined
    });

  } catch (error) {
    console.error('AI Analytics Error:', error);
    res.status(500).json({ error: 'Failed to process AI analytics query' });
  }
});

router.get('/manufacturing', async (req, res) => {
  try {
    const RawMaterialEntry = require('../models/RawMaterialEntry');
    const BatchProduction = require('../models/BatchProduction');

    // 1. Raw Materials Valuation
    const rmEntries = await RawMaterialEntry.find({ qty: { $gt: 0 } }).lean();
    const netRawMaterialValue = rmEntries.reduce((acc, entry) => {
      return acc + (entry.qty * (entry.purchaseRate || 0));
    }, 0);

    // 2. Finished Goods Valuation
    const fgEntries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } }).populate('productId').lean();
    const netFinishedGoodsValue = fgEntries.reduce((acc, entry) => {
      const price = entry.productId ? (entry.productId.price || 0) : 0;
      const units = (entry.qtyBoxes || 0) * (entry.packing || 1);
      return acc + (units * price);
    }, 0);

    // 3. Yield Performance of last 10 completed batches
    const completedRuns = await BatchProduction.find({ status: 'completed' })
      .sort({ endDate: -1 })
      .limit(10)
      .populate('productId')
      .lean();

    const yieldPerformance = completedRuns.map(run => ({
      batchNo: run.batchNo,
      productName: run.productId ? run.productId.name : 'Unknown Product',
      plannedQty: run.plannedQty,
      actualYieldQty: run.actualYieldQty || 0,
      efficiency: run.plannedQty > 0 
        ? Number(((run.actualYieldQty || 0) / run.plannedQty * 100).toFixed(1)) 
        : 100
    }));

    // 4. Timeline (Gantt representation) of active and historical runs
    const allRuns = await BatchProduction.find({})
      .sort({ startDate: -1 })
      .limit(20)
      .populate('productId')
      .lean();

    const timeline = allRuns.map(run => ({
      id: run._id,
      batchNo: run.batchNo,
      productName: run.productId ? run.productId.name : 'Unknown Product',
      plannedQty: run.plannedQty,
      actualYieldQty: run.actualYieldQty || 0,
      status: run.status,
      startDate: run.startDate,
      endDate: run.endDate
    }));

    res.json({
      netRawMaterialValue: Number(netRawMaterialValue.toFixed(2)),
      netFinishedGoodsValue: Number(netFinishedGoodsValue.toFixed(2)),
      yieldPerformance,
      timeline
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
