const express = require('express');
const Product = require('../../models/Product');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const BillOfMaterials = require('../../models/BillOfMaterials');
const ProductionPlan = require('../../models/ProductionPlan');
const Warehouse = require('../../models/Warehouse');
const { authorize } = require('../../middleware/authorize');
const { computeDemandForecast } = require('./demandForecasting');

const router = express.Router();

// GET /api/analytics/material-requirements-plan — Material Requirements Plan (MRP) calculation
router.get('/', authorize('report:view'), async (req, res) => {
  try {
    const forecasts = await computeDemandForecast();
    const shortfallProducts = forecasts.filter(f => f.reorderRecommended && f.recommendedReorderQty > 0);

    // Map rawMaterialId -> { rawMaterialId, requiredForProduction, drivenByProducts: Map<productId, obj> }
    const rmRequirements = new Map();

    for (const sp of shortfallProducts) {
      const pId = sp.productId ? sp.productId.toString() : null;
      if (!pId) continue;

      const shortfallUnits = sp.recommendedReorderQty;

      // Find primary/default active BOM for the product
      let bom = await BillOfMaterials.findOne({ productId: pId, isDefault: true, isActive: true }).lean();
      if (!bom) {
        bom = await BillOfMaterials.findOne({ productId: pId, isActive: true }).lean();
      }

      if (!bom || !Array.isArray(bom.ingredients)) continue;

      const formulationBasis = bom.formulationBasis || 100;

      for (const ing of bom.ingredients) {
        // Scope strictly to formulation-type ingredients
        if (ing.itemType && ing.itemType !== 'formulation') continue;
        const rmId = ing.rawMaterialId ? ing.rawMaterialId.toString() : null;
        if (!rmId) continue;

        const qtyReq = ing.qtyRequired || 0;
        const requiredQtyForProduct = Number((qtyReq * (shortfallUnits / formulationBasis)).toFixed(4));

        if (!rmRequirements.has(rmId)) {
          rmRequirements.set(rmId, {
            rawMaterialId: rmId,
            requiredForProduction: 0,
            drivenByProductsMap: new Map()
          });
        }

        const rmData = rmRequirements.get(rmId);
        rmData.requiredForProduction += requiredQtyForProduct;

        if (!rmData.drivenByProductsMap.has(pId)) {
          rmData.drivenByProductsMap.set(pId, {
            productId: sp.productId,
            productName: sp.productName,
            shortfallUnits,
            requiredQtyForProduct: 0
          });
        }

        const prodDriven = rmData.drivenByProductsMap.get(pId);
        prodDriven.requiredQtyForProduct = Number((prodDriven.requiredQtyForProduct + requiredQtyForProduct).toFixed(4));
      }
    }

    // Fetch all RawMaterials to include those with stock below minReorder
    const allRawMaterials = await RawMaterial.find({}).lean();
    const now = new Date();
    const suggestions = [];

    for (const rm of allRawMaterials) {
      const rmId = rm._id.toString();
      const reqData = rmRequirements.get(rmId);
      const requiredForProduction = reqData ? Number(reqData.requiredForProduction.toFixed(4)) : 0;
      const minReorderThreshold = rm.minReorder || 0;

      // Calculate current net available stock from non-expired lots
      const entries = await RawMaterialEntry.find({ rawMaterialId: rm._id })
        .sort({ createdAt: -1 })
        .lean();

      let currentAvailableStock = 0;
      let preferredVendor = { vendorId: null, vendorName: '' };

      for (const entry of entries) {
        // Exclude expired lots
        if (entry.expiryDate && new Date(entry.expiryDate) < now) continue;

        const availableInLot = Math.max(0, (entry.qty || 0) - (entry.reservedQty || 0));
        currentAvailableStock += availableInLot;

        if (!preferredVendor.vendorId && !preferredVendor.vendorName && (entry.vendorId || entry.vendorName)) {
          preferredVendor = {
            vendorId: entry.vendorId || null,
            vendorName: entry.vendorName || ''
          };
        }
      }

      currentAvailableStock = Number(currentAvailableStock.toFixed(4));

      // Formula: max(0, requiredForProduction - availableStock, minReorder - availableStock)
      const prodShortfall = requiredForProduction - currentAvailableStock;
      const safetyShortfall = minReorderThreshold - currentAvailableStock;
      const suggestedPurchaseQty = Number(Math.max(0, prodShortfall, safetyShortfall).toFixed(4));

      // Only include raw materials that either have production demand OR have a suggested purchase quantity
      if (requiredForProduction > 0 || suggestedPurchaseQty > 0) {
        const drivenByProducts = reqData ? Array.from(reqData.drivenByProductsMap.values()) : [];

        suggestions.push({
          rawMaterialId: rm._id,
          rawMaterialName: rm.name,
          unit: rm.unit || 'kg',
          category: rm.category || 'General',
          requiredForProduction,
          currentAvailableStock,
          minReorderThreshold,
          suggestedPurchaseQty,
          drivenByProducts,
          preferredVendor
        });
      }
    }

    // Sort suggestions descending by suggestedPurchaseQty, then requiredForProduction
    suggestions.sort((a, b) => b.suggestedPurchaseQty - a.suggestedPurchaseQty || b.requiredForProduction - a.requiredForProduction);

    res.json({
      generatedAt: new Date().toISOString(),
      suggestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/material-requirements-plan/create-production-plans — Create draft production plans for shortfall products
router.post('/create-production-plans', authorize('manufacturing:create'), async (req, res) => {
  try {
    const { productIds } = req.body;
    const forecasts = await computeDemandForecast();

    let targetProducts = [];
    if (Array.isArray(productIds) && productIds.length > 0) {
      const idSet = new Set(productIds.map(id => id.toString()));
      targetProducts = forecasts.filter(f => idSet.has(f.productId.toString()));
    } else {
      targetProducts = forecasts.filter(f => f.reorderRecommended && f.recommendedReorderQty > 0);
    }

    if (targetProducts.length === 0) {
      return res.status(400).json({ error: 'No valid shortfall products found to generate production plans.' });
    }

    // Default manufacturing unit/warehouse
    let defaultWh = await Warehouse.findOne({ isDefault: true }).lean();
    if (!defaultWh) {
      defaultWh = await Warehouse.findOne().lean();
    }

    const whId = defaultWh ? defaultWh._id : '507f1f77bcf86cd799439011';
    const whName = defaultWh ? defaultWh.name : 'Main Plant';

    const createdPlans = [];
    const currentYear = new Date().getFullYear();
    const fy = `${currentYear % 100}-${(currentYear + 1) % 100}`;

    for (const tp of targetProducts) {
      const planNo = `PLN/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;
      const plannedQty = tp.recommendedReorderQty > 0 ? tp.recommendedReorderQty : 100;

      const plan = await ProductionPlan.create({
        planNo,
        title: `MRP Plan - ${tp.productName}`,
        manufacturingUnitId: whId,
        manufacturingUnitName: whName,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        plannedBatches: [
          {
            productId: tp.productId,
            productName: tp.productName,
            plannedQty,
            targetBatchNo: '',
            estimatedDays: 7
          }
        ],
        rawMaterialSufficiencyStatus: 'not_checked',
        shortageDetails: [],
        status: 'draft',
        plannerName: req.user ? req.user.name : 'MRP System',
        notes: `Auto-generated from Material Requirements Plan based on projected demand shortfall of ${plannedQty} units.`
      });

      createdPlans.push(plan);
    }

    res.status(201).json({
      message: `Created ${createdPlans.length} draft production plan(s).`,
      count: createdPlans.length,
      plans: createdPlans
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
