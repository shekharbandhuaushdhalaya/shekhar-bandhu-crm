const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authorize } = require('../../middleware/authorize');

// Import models
const Invoice = require('../../models/Invoice');
const InventoryEntry = require('../../models/InventoryEntry');
const Customer = require('../../models/Customer');

// Initialize Gemini
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

router.get('/query', authorize('analytics:query'), async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
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
            totalOutstanding: "$regularBalance"
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

const SystemSettings = require('../../models/SystemSettings');
const RolePermission = require('../../models/RolePermission');
const { authenticateToken } = require('../auth/auth');

// Helper to check user permission from DB
async function checkUserPermission(user, permName) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const rp = await RolePermission.findOne({ role: user.role }).lean();
  if (rp && rp.permissions && rp.permissions.includes(permName)) return true;
  return false;
}

// POST /api/analytics/ask — Query Business AI with strict RBAC permission enforcement
router.post('/ask', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const q = prompt.toLowerCase();

    // 1. Permission checks for Financial & Profit Queries
    const isFinancialQuery = q.includes('sale') || q.includes('revenue') || q.includes('profit') || q.includes('turnover') || q.includes('income') || q.includes('gst') || q.includes('margin') || q.includes('earnings');
    if (isFinancialQuery) {
      const canViewFinancials = await checkUserPermission(req.user, 'report:view') || await checkUserPermission(req.user, 'invoice:view');
      if (!canViewFinancials) {
        return res.json({
          answer: `🔒 Access Restricted: Your account role (${(req.user.role || 'user').toUpperCase()}) does not have financial reporting permissions (report:view) to view business profits, revenues, or sales data.`
        });
      }
    }

    // 2. Permission checks for Customer & Outstanding Balances Queries
    const isCustomerQuery = q.includes('customer') || q.includes('due') || q.includes('outstanding') || q.includes('balance') || q.includes('debt');
    if (isCustomerQuery) {
      const canViewCustomers = await checkUserPermission(req.user, 'customer:view') || await checkUserPermission(req.user, 'report:view');
      if (!canViewCustomers) {
        return res.json({
          answer: `🔒 Access Restricted: Your account role (${(req.user.role || 'user').toUpperCase()}) does not have permissions to access customer ledgers or outstanding balance records.`
        });
      }
    }

    // Fetch API key from DB SystemSettings or process.env
    const sys = await SystemSettings.findOne({ key: 'company_config' }).lean();
    const apiKey = (sys && sys.geminiApiKey && sys.geminiApiKey.trim()) ? sys.geminiApiKey.trim() : process.env.GEMINI_API_KEY;

    let aiText = '';
    let dataContext = [];

    if (isFinancialQuery) {
      const sales = await Invoice.aggregate([
        { $match: { type: 'sale', isFinalized: true } },
        {
          $group: {
            _id: { $month: "$date" },
            totalRevenue: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 6 }
      ]);
      dataContext = sales;
    } else if (isCustomerQuery) {
      const custs = await Customer.find({ regularBalance: { $gt: 0 } }).sort({ regularBalance: -1 }).limit(5).lean();
      dataContext = custs.map(c => ({ customerName: c.company || c.name, outstandingBalance: c.regularBalance }));
    } else if (q.includes('inventory') || q.includes('stock') || q.includes('raw') || q.includes('product') || q.includes('batch') || q.includes('yield')) {
      const inv = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } }).populate('productId', 'name sku').limit(8).lean();
      dataContext = inv.map(i => ({ product: i.productId ? i.productId.name : i.productType, warehouse: i.warehouseName, boxes: i.qtyBoxes }));
    }

    if (apiKey) {
      try {
        const customGenAI = new GoogleGenerativeAI(apiKey);
        const model = customGenAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const fullPrompt = `You are Shekhar Bandhu Aushadhalaya's official AI Business Intelligence Assistant. 
User Role: ${req.user.role || 'employee'}
User Question: "${prompt}"
Verified Permission Context: ${JSON.stringify(dataContext)}

Strict Security Rule: Answer the user's question accurately based ONLY on the provided context. If the user asks for unauthorized data, decline politely. Keep answer in 2-4 clear sentences.`;

        const result = await model.generateContent(fullPrompt);
        aiText = result.response.text();
      } catch (genErr) {
        aiText = `AI API Error: ${genErr.message || 'Invalid API Key'}`;
      }
    } else {
      aiText = `[AI Key Required] Please enter your Gemini API Key in Profile > My Credentials to enable AI queries. Live CRM context found: ${JSON.stringify(dataContext)}`;
    }

    res.json({ answer: aiText, data: dataContext });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to process AI query' });
  }
});

// GET /api/analytics/manufacturing — Retrieve manufacturing analytics, stats, and visual timeline runs
router.get('/manufacturing', async (req, res) => {
  try {
    const BatchProduction = require('../../models/BatchProduction');
    const BillOfMaterials = require('../../models/BillOfMaterials');
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const InventoryEntry = require('../../models/InventoryEntry');

    const totalBatches = await BatchProduction.countDocuments({});
    const completedBatches = await BatchProduction.countDocuments({ status: 'completed' });
    const rejectedBatches = await BatchProduction.countDocuments({ status: 'rejected' });
    const inProgressBatches = await BatchProduction.countDocuments({ status: 'in_progress' });
    const qcHoldBatches = await BatchProduction.countDocuments({ status: 'qc_hold' });

    // Calculate Raw Stock Valuation
    const rawEntries = await RawMaterialEntry.find({ qty: { $gt: 0 } }).lean();
    const netRawMaterialValue = rawEntries.reduce((sum, e) => sum + ((e.qty || 0) * (e.purchaseRate || 0)), 0);

    // Calculate Finished Goods Valuation
    const finEntries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } }).lean();
    const netFinishedGoodsValue = finEntries.reduce((sum, e) => sum + ((e.qtyBoxes || 0) * (e.purchaseRate || 0)), 0);

    // Yield Performance of completed batches
    const completedBatchList = await BatchProduction.find({ status: 'completed' })
      .populate('productId', 'name sku')
      .sort({ endDate: -1 })
      .limit(10)
      .lean();

    const yieldPerformance = completedBatchList.map(b => {
      const efficiency = b.plannedQty > 0 ? Number(((b.actualYieldQty / b.plannedQty) * 100).toFixed(1)) : 100;
      return {
        batchNo: b.batchNo,
        productName: b.productId ? b.productId.name : 'Finished Product',
        plannedQty: b.plannedQty,
        actualYieldQty: b.actualYieldQty,
        efficiency
      };
    });

    const totalYield = await BatchProduction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$actualYieldQty' } } }
    ]);

    const totalWaste = await BatchProduction.aggregate([
      { $group: { _id: null, total: { $sum: '$wasteQty' } } }
    ]);

    const rawTimeline = await BatchProduction.find({})
      .populate('productId', 'name sku')
      .sort({ startDate: -1 })
      .limit(10)
      .lean();

    const timeline = rawTimeline.map(run => ({
      id: run._id,
      batchNo: run.batchNo,
      productName: run.productId ? run.productId.name : 'Unknown Product',
      productSku: run.productId ? run.productId.sku : 'N/A',
      plannedQty: run.plannedQty,
      actualYieldQty: run.actualYieldQty,
      startDate: run.startDate,
      endDate: run.endDate,
      status: run.status,
      stages: run.stages || []
    }));

    res.json({
      netRawMaterialValue,
      netFinishedGoodsValue,
      yieldPerformance,
      batchesCount: {
        total: totalBatches,
        completed: completedBatches,
        rejected: rejectedBatches,
        inProgress: inProgressBatches,
        qcHold: qcHoldBatches
      },
      yieldStats: {
        totalYield: totalYield[0] ? totalYield[0].total : 0,
        totalWaste: totalWaste[0] ? totalWaste[0].total : 0
      },
      timeline
    });
  } catch (err) {
    console.error('Mfg Analytics Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
