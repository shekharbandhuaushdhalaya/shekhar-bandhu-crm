const express = require('express');
const rateLimit = require('express-rate-limit');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const { validate } = require('../../middleware/validate');
const { z } = require('zod');

const router = express.Router();

const PUBLIC_PRODUCT_FIELDS = '_id name sku price mrp discount discountLabel websitePromoActive category hsnCode gstRate productType size colour shape weight image description disease ingredients suggestedDosage benefits rating ratingCount parentId';

const ratingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many rating attempts, please try again later.' },
});

function sellableFilter(extra = {}) {
  return {
    ...extra,
    qtyBoxes: { $gt: 0 },
    qcStatus: 'approved',
    $or: [
      { expiryDate: null },
      { expiryDate: { $exists: false } },
      { expiryDate: { $gt: new Date() } },
    ],
  };
}

function publicProduct(product, inventoryQty = 0) {
  return {
    _id: product._id,
    name: product.name,
    sku: product.sku || '',
    price: Number(product.price || 0),
    mrp: Number(product.mrp || product.price || 0),
    discount: Number(product.discount || 0),
    discountLabel: product.discountLabel || '',
    websitePromoActive: Boolean(product.websitePromoActive),
    category: product.category || 'General',
    hsnCode: product.hsnCode || '',
    gstRate: Number(product.gstRate || 0),
    productType: product.productType || '',
    size: product.size || '',
    colour: product.colour || '',
    shape: product.shape || '',
    weight: product.weight || '',
    image: product.image || '',
    description: product.description || '',
    disease: product.disease || '',
    ingredients: product.ingredients || '',
    suggestedDosage: product.suggestedDosage || '',
    benefits: product.benefits || '',
    rating: Number(product.rating || 0),
    ratingCount: Number(product.ratingCount || 0),
    parentId: product.parentId || null,
    inventoryQty: Number(inventoryQty || 0),
  };
}

async function inventoryUnitsByProduct(productIds) {
  if (!productIds.length) return {};
  const entries = await InventoryEntry.find(sellableFilter({ productId: { $in: productIds } }))
    .select('productId qtyBoxes packing')
    .lean();
  const map = {};
  for (const entry of entries) {
    const id = String(entry.productId);
    map[id] = Number(map[id] || 0) + (Number(entry.qtyBoxes || 0) * Math.max(1, Number(entry.packing || 1)));
  }
  return map;
}

router.get('/', async (req, res) => {
  try {
    const products = await Product.find({}).select(PUBLIC_PRODUCT_FIELDS).sort({ name: 1 }).lean();
    const inventoryMap = await inventoryUnitsByProduct(products.map(p => p._id));
    res.json(products.map(p => publicProduct(p, inventoryMap[String(p._id)] || 0)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select(PUBLIC_PRODUCT_FIELDS).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const parentId = product.parentId || product._id;
    const variants = await Product.find({
      $or: [{ _id: parentId }, { parentId }],
    }).select(PUBLIC_PRODUCT_FIELDS).lean();
    const inventoryMap = await inventoryUnitsByProduct(variants.map(v => v._id));
    const enrichedVariants = variants
      .map(v => publicProduct(v, inventoryMap[String(v._id)] || 0))
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

    const selected = publicProduct(product, inventoryMap[String(product._id)] || 0);
    res.json({ ...selected, variants: enrichedVariants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/rate', ratingLimiter, validate(z.object({ rating: z.number().min(1).max(5) })), async (req, res) => {
  try {
    const val = Number(req.body.rating);
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const currentCount = Number(product.ratingCount || 0);
    const currentAvg = Number(product.rating || 0);
    product.ratingCount = currentCount + 1;
    product.rating = Math.round((((currentAvg * currentCount) + val) / product.ratingCount) * 10) / 10;
    await product.save();

    req.io?.emit('product_updated', { type: 'rated', id: product._id });
    res.json({ rating: product.rating, ratingCount: product.ratingCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
