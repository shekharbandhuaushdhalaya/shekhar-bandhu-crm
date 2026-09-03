const express = require('express');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const { authorize } = require('../../middleware/authorize');
const { generateSku } = require('../../utils/skuGenerator');
const { getRolePermissions } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { z } = require('zod');
const { logAction } = require('../../utils/auditLogger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(buffer, folder = 'shekhar-bandhu/products') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

const router = express.Router();

// GET /api/products — List products with optional search filter
router.get('/', authorize('product:view'), async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    let query = Product.find(filter);
    const rolePerms = await getRolePermissions(req.user.role);
    if (!rolePerms.includes('product:viewPricing') && !rolePerms.includes('*')) {
      query = query.select('-price');
    }

    const products = await query.sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const normalizeTitleCase = (str) => {
  if (!str) return '';
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const normalizeWhitespace = (str) => {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
};

const getNormalizedSpecs = (body) => {
  return {
    productType: normalizeTitleCase(body.productType),
    size: normalizeWhitespace(body.size),
    colour: normalizeTitleCase(body.colour),
    shape: normalizeTitleCase(body.shape),
    weight: normalizeWhitespace(body.weight)
  };
};

// POST /api/products — Create product and instantiate inventory record
router.post('/', validate(schemas.productSchema), authorize('product:create'), async (req, res) => {
  try {
    const specs = getNormalizedSpecs(req.body);
    const existing = await Product.findOne(specs).collation({ locale: 'en', strength: 2 }).lean();
    if (existing) {
      return res.status(400).json({ error: 'A product with this combination of Type, Size, Colour, Shape, and Weight already exists.' });
    }

    if (req.body.parentId) {
      const parent = await Product.findById(req.body.parentId).lean();
      if (parent) {
        req.body.name = parent.name;
        req.body.category = parent.category;
        req.body.description = parent.description;
        req.body.disease = parent.disease;
        req.body.ingredients = parent.ingredients;
        req.body.image = parent.image;
        req.body.productType = parent.productType;
        req.body.colour = parent.colour;
        req.body.shape = parent.shape;
        req.body.weight = parent.weight;
        req.body.hsnCode = parent.hsnCode;
        req.body.gstRate = parent.gstRate;
      }
    } else {
      Object.assign(req.body, specs);
      if (!req.body.name) {
        const nameParts = [];
        if (req.body.size) nameParts.push(req.body.size);
        if (req.body.shape) nameParts.push(req.body.shape);
        if (req.body.colour) nameParts.push(req.body.colour);
        req.body.name = nameParts.length > 0 ? nameParts.join(' ') : 'Unnamed Product';
      }
    }

    let computedSku = generateSku(req.body);
    let skuConflict = await Product.findOne({ sku: computedSku }).lean();
    let counter = 1;
    while (skuConflict) {
      computedSku = `${generateSku(req.body)}-${counter}`;
      skuConflict = await Product.findOne({ sku: computedSku }).lean();
      counter++;
    }
    req.body.sku = computedSku;

    const product = await Product.create(req.body);

    if (req.io) {
      req.io.emit('product_updated', { type: 'created', id: product._id });
    }
    res.status(201).json(product);

    await logAction({
      action: 'CREATE_PRODUCT',
      description: `Created product: ${product.name} (SKU: ${product.sku})`,
      details: { productId: product._id, name: product.name, sku: product.sku, category: product.category },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id — Update product specifications
router.put('/:id', validate(schemas.productSchema.partial()), authorize('product:edit'), async (req, res) => {
  try {
    const oldProduct = await Product.findById(req.params.id);
    if (!oldProduct) return res.status(404).json({ error: 'Product not found' });

    if (!req.body.name) {
      const nameParts = [];
      if (req.body.size) nameParts.push(req.body.size);
      if (req.body.shape) nameParts.push(req.body.shape);
      if (req.body.colour) nameParts.push(req.body.colour);
      req.body.name = nameParts.length > 0 ? nameParts.join(' ') : 'Unnamed Product';
    }

    const hasSpecChange = ['name', 'productType', 'size', 'shape'].some(k => req.body[k] !== undefined);
    if (hasSpecChange) {
      const mergedObj = Object.assign({}, oldProduct.toObject(), req.body);
      let computedSku = generateSku(mergedObj);
      let skuConflict = await Product.findOne({ sku: computedSku, _id: { $ne: req.params.id } }).lean();
      let counter = 1;
      while (skuConflict) {
        computedSku = `${generateSku(mergedObj)}-${counter}`;
        skuConflict = await Product.findOne({ sku: computedSku, _id: { $ne: req.params.id } }).lean();
        counter++;
      }
      req.body.sku = computedSku;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (updatedProduct && !updatedProduct.parentId) {
      const sharedFields = ['name', 'category', 'description', 'disease', 'ingredients', 'image', 'productType', 'colour', 'shape', 'weight', 'hsnCode', 'gstRate', 'suggestedDosage', 'benefits'];
      const syncUpdate = {};
      let hasSharedUpdate = false;
      for (const field of sharedFields) {
        if (req.body[field] !== undefined) {
          syncUpdate[field] = req.body[field];
          hasSharedUpdate = true;
        }
      }
      if (hasSharedUpdate) {
        await Product.updateMany({ parentId: updatedProduct._id }, { $set: syncUpdate });
      }
    }

    res.json(updatedProduct);

    await logAction({
      action: 'UPDATE_PRODUCT',
      description: `Updated product: ${updatedProduct.name} (SKU: ${updatedProduct.sku})`,
      details: { productId: updatedProduct._id, name: updatedProduct.name, sku: updatedProduct.sku, changes: Object.keys(req.body) },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — Remove product when total inventory stock is 0 (preserves stock ledger and zero-qty inventory history)
router.delete('/:id', authorize('product:delete'), async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Check current stock across all inventory entries for this product
    const inventoryEntries = await InventoryEntry.find({ productId }).lean();
    const totalStock = inventoryEntries.reduce((sum, entry) => sum + (entry.qtyBoxes || 0), 0);

    if (totalStock > 0) {
      return res.status(400).json({ 
        error: `Cannot delete product. Remaining stock is ${totalStock} box(es). Please clear stock before deletion.` 
      });
    }

    const product = await Product.findByIdAndDelete(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Preserve InventoryEntry records (which now have 0 stock) and StockLedger records for audit/ledger history

    res.json({ message: 'Product deleted successfully. Inventory ledger records preserved.' });

    await logAction({
      action: 'DELETE_PRODUCT',
      description: `Deleted product: ${product.name} (SKU: ${product.sku})`,
      details: { productId: product._id, name: product.name, sku: product.sku },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/image — Upload product image to Cloudinary
router.post('/:id/image', authorize('product:edit'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer);
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { image: imageUrl },
      { new: true }
    );
    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/image/append — Upload and append a new image to the product's image list
router.post('/:id/image/append', authorize('product:edit'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer);
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let images = product.image ? product.image.split(',').map(s => s.trim()).filter(Boolean) : [];
    images.push(imageUrl);
    product.image = images.join(',');
    await product.save();

    if (req.io) {
      req.io.emit('product_updated', { type: 'updated', id: product._id });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/image/delete — Remove a specific image URL from the product's image list
router.post('/:id/image/delete', authorize('product:edit'), async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let images = product.image ? product.image.split(',').map(s => s.trim()).filter(Boolean) : [];
    images = images.filter(url => url !== imageUrl);
    product.image = images.join(',');
    await product.save();

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/:id/pricing — Update price, discount & promo banner (requires editPricing permission)
router.patch('/:id/pricing', validate(z.object({ discount: z.number().optional(), discountLabel: z.string().optional(), websitePromoActive: z.boolean().optional() })), authorize('product:editPricing'), async (req, res) => {
  try {
    const { price, discount, discountLabel, websitePromoActive } = req.body;

    const updateFields = {};
    if (price !== undefined)              updateFields.price = Number(price);
    if (discount !== undefined)           updateFields.discount = Math.min(100, Math.max(0, Number(discount)));
    if (discountLabel !== undefined)      updateFields.discountLabel = String(discountLabel).trim();
    if (websitePromoActive !== undefined) updateFields.websitePromoActive = Boolean(websitePromoActive);

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });

    res.json(updated);

    await logAction({
      action: 'UPDATE_PRODUCT_PRICING',
      description: `Updated pricing for product: ${updated.name} (SKU: ${updated.sku}) — Price: ₹${updated.price}, Discount: ${updated.discount}%`,
      details: { productId: updated._id, name: updated.name, sku: updated.sku, price: updated.price, discount: updated.discount, websitePromoActive: updated.websitePromoActive },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/products/:id/generate-spc — Generate Specific Product Code (SPC) per Schedule T (Rule 158B)
router.post('/:id/generate-spc', authorize('product:edit'), async (req, res) => {
  try {
    const { stateCode, licenceType, licenceSerial, systemOfMedicine, productSerial, approvalYear } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean();

    const stCode = stateCode || (settings ? settings.stateUtCode : 'UP') || 'UP';
    const licType = licenceType || 'D';
    const licSerial = licenceSerial || (settings ? settings.licenceSerial : '1234') || '1234';
    const sysMed = systemOfMedicine || (product.category === 'Classical' ? 'Classical' : 'PP');
    const prodSerial = productSerial || product._id.toString().slice(-4).toUpperCase();
    const appYear = approvalYear || new Date().getFullYear();

    const spc = `${stCode}/${licType}/${licSerial}/${sysMed}/${prodSerial}/${appYear}`;

    product.specificProductCode = spc;
    product.spcComponents = {
      stateCode: stCode,
      licenceType: licType,
      licenceSerial: licSerial,
      systemOfMedicine: sysMed,
      productSerial: prodSerial,
      approvalYear: appYear
    };

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
