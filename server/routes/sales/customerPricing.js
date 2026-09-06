const express = require('express');
const CustomerPricing = require('../../models/CustomerPricing');
const Product = require('../../models/Product');
const RawMaterial = require('../../models/RawMaterial');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// Helper: Calculate effective pricing for an item based on customer rules & quantity
function calculateEffectivePricing(rule, standardPrice, qty) {
  let effectiveRate = standardPrice;
  let effectiveDiscountPercent = 0;
  let pricingSource = 'standard';
  let appliedTier = null;

  if (rule) {
    // Check if promotional validity expired
    if (rule.validUntil && new Date(rule.validUntil) < new Date()) {
      return {
        standardPrice,
        effectiveRate,
        effectiveDiscountPercent,
        finalUnitPrice: standardPrice,
        pricingSource: 'expired',
        appliedTier: null
      };
    }

    // 1. Base custom rate or base discount percent
    if (rule.customRate !== null && rule.customRate !== undefined) {
      effectiveRate = rule.customRate;
      pricingSource = 'custom_rate';
    }
    if (rule.discountPercent > 0) {
      effectiveDiscountPercent = rule.discountPercent;
      pricingSource = 'custom_discount';
    }

    // 2. Volume Tiers Evaluation (highest matching minQty <= qty)
    if (rule.volumeTiers && rule.volumeTiers.length > 0) {
      const sortedTiers = [...rule.volumeTiers].sort((a, b) => b.minQty - a.minQty);
      const matchingTier = sortedTiers.find(t => qty >= t.minQty);

      if (matchingTier) {
        appliedTier = matchingTier;
        pricingSource = 'volume_tier';
        if (matchingTier.fixedRate !== null && matchingTier.fixedRate !== undefined) {
          effectiveRate = matchingTier.fixedRate;
        }
        if (matchingTier.discountPercent > 0) {
          effectiveDiscountPercent = matchingTier.discountPercent;
        }
      }
    }
  }

  // Final line rate after applying effective discount %
  const finalUnitPrice = Number((effectiveRate * (1 - effectiveDiscountPercent / 100)).toFixed(2));

  return {
    standardPrice,
    effectiveRate,
    effectiveDiscountPercent,
    finalUnitPrice,
    pricingSource,
    appliedTier
  };
}

const DEFAULT_TRADE_MATRIX = {
  super_stockist: 45,
  distributor: 35,
  retailer: 20,
  hospital: 15,
  direct: 0
};

// GET /api/customer-pricing/trade-matrix — Retrieve trade category discount matrix
router.get('/trade-matrix', authorize('pricing:view'), async (req, res) => {
  try {
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};
    const matrix = settings.tradeDiscountMatrix || DEFAULT_TRADE_MATRIX;
    res.json(matrix);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customer-pricing/trade-matrix — Update trade category discount matrix
router.post('/trade-matrix', authorize('pricing:edit'), async (req, res) => {
  try {
    const SystemSettings = require('../../models/SystemSettings');
    const matrix = req.body;
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings({});
    }
    settings.tradeDiscountMatrix = { ...DEFAULT_TRADE_MATRIX, ...matrix };
    await settings.save();
    res.json({ success: true, tradeDiscountMatrix: settings.tradeDiscountMatrix });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customer-pricing/resolve — Resolution engine for billing UI auto-fill
router.post('/resolve', authorize('pricing:view'), validate(schemas.pricingResolveSchema), async (req, res) => {
  try {
    const { customerId, items } = req.body;

    const customer = await Customer.findById(customerId).lean();
    const customerDefaultDiscount = customer ? (customer.discountPercent || 0) : 0;
    const tradeCategory = customer ? (customer.tradeCategory || 'distributor') : 'distributor';

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};
    const tradeMatrix = settings.tradeDiscountMatrix || DEFAULT_TRADE_MATRIX;

    const categoryDiscount = customer && customer.tradeDiscountOverride !== null && customer.tradeDiscountOverride !== undefined
      ? customer.tradeDiscountOverride
      : (tradeMatrix[tradeCategory] !== undefined ? tradeMatrix[tradeCategory] : 35);

    const resolvedItems = [];

    for (const item of items) {
      const { productId, rawMaterialId, qty = 1 } = item;
      let rule = null;
      let standardPrice = 0;
      let itemName = '';
      let itemCode = '';
      let unit = '';

      if (productId) {
        rule = await CustomerPricing.findOne({ customerId, productId }).lean();
        const prod = await Product.findById(productId).lean();
        if (prod) {
          standardPrice = prod.price || prod.mrp || 0;
          itemName = prod.name;
          itemCode = prod.sku;
          unit = prod.unit || 'pcs';
        }
      } else if (rawMaterialId) {
        rule = await CustomerPricing.findOne({ customerId, rawMaterialId }).lean();
        const rm = await RawMaterial.findById(rawMaterialId).lean();
        if (rm) {
          standardPrice = 0;
          itemName = rm.name;
          itemCode = rm.sku;
          unit = rm.unit || 'kg';
        }
      }

      const pricing = calculateEffectivePricing(rule, standardPrice, Number(qty));

      // Fallback to customer Trade Category Discount Matrix if no specific product rule discount applied
      if (!rule && pricing.effectiveDiscountPercent === 0) {
        const effectiveDisc = categoryDiscount > 0 ? categoryDiscount : customerDefaultDiscount;
        if (effectiveDisc > 0) {
          pricing.effectiveDiscountPercent = effectiveDisc;
          pricing.pricingSource = categoryDiscount > 0 ? 'trade_category_matrix' : 'customer_default_discount';
          pricing.finalUnitPrice = Number((pricing.effectiveRate * (1 - effectiveDisc / 100)).toFixed(2));
        }
      }

      resolvedItems.push({
        productId: productId || null,
        rawMaterialId: rawMaterialId || null,
        name: itemName,
        sku: itemCode,
        unit,
        qty: Number(qty),
        standardPrice: pricing.standardPrice,
        effectiveRate: pricing.effectiveRate,
        discountPercent: pricing.effectiveDiscountPercent,
        finalUnitPrice: pricing.finalUnitPrice,
        totalAmount: Number((pricing.finalUnitPrice * Number(qty)).toFixed(2)),
        pricingSource: pricing.pricingSource,
        appliedTier: pricing.appliedTier,
        appliedTradeCategory: tradeCategory
      });
    }

    res.json({
      customerId,
      customerDefaultDiscount,
      tradeCategory,
      appliedCategoryDiscount: categoryDiscount,
      items: resolvedItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customer-pricing/:customerId — Get all special pricing rules for a customer
router.get('/:customerId', authorize('pricing:view'), async (req, res) => {
  try {
    const pricing = await CustomerPricing.find({ customerId: req.params.customerId })
      .populate('productId', 'name sku mrp price category unit')
      .populate('rawMaterialId', 'name sku unit category')
      .lean();
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customer-pricing/:customerId — Upsert customer pricing rule for product or raw material
router.put('/:customerId', authorize('pricing:edit'), validate(schemas.customerPricingSchema), async (req, res) => {
  try {
    const { productId, rawMaterialId, customRate, discountPercent, volumeTiers, validUntil } = req.body;
    const customerId = req.params.customerId;

    if (!productId && !rawMaterialId) {
      return res.status(400).json({ error: 'Either productId or rawMaterialId must be specified' });
    }

    const query = { customerId };
    if (productId) query.productId = productId;
    if (rawMaterialId) query.rawMaterialId = rawMaterialId;

    const update = {
      customRate: customRate !== undefined && customRate !== null ? Number(customRate) : null,
      discountPercent: discountPercent !== undefined ? Number(discountPercent) : 0,
      volumeTiers: volumeTiers || [],
      validUntil: validUntil ? new Date(validUntil) : null
    };

    const pricing = await CustomerPricing.findOneAndUpdate(
      query,
      update,
      { upsert: true, new: true, runValidators: true }
    ).populate('productId', 'name sku price').populate('rawMaterialId', 'name sku');

    if (req.io) {
      req.io.emit('pricing_updated', { type: 'updated', customerId });
    }
    res.json(pricing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/customer-pricing/:customerId/:itemType/:itemId — Delete pricing rule
router.delete('/:customerId/:itemType/:itemId', authorize('pricing:delete'), async (req, res) => {
  try {
    const { customerId, itemType, itemId } = req.params;
    const query = { customerId };
    if (itemType === 'product') query.productId = itemId;
    else if (itemType === 'rawMaterial') query.rawMaterialId = itemId;
    else query._id = itemId;

    await CustomerPricing.findOneAndDelete(query);

    if (req.io) {
      req.io.emit('pricing_updated', { type: 'deleted', customerId });
    }
    res.json({ message: 'Special pricing removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
