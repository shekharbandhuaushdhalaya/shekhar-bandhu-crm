const express = require('express');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage — we stream the buffer directly to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// Helper: upload a Buffer to Cloudinary and return the secure URL
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
router.get('/', async (req, res) => {
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
    if (req.user && req.user.role === 'agent') {
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
router.post('/', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot create products.' });
    }
    const specs = getNormalizedSpecs(req.body);
    // Check duplicate combination of type+size+colour+shape+weight case-insensitively
    const existing = await Product.findOne(specs).collation({ locale: 'en', strength: 2 }).lean();
    if (existing) {
      return res.status(400).json({ error: 'A product with this combination of Type, Size, Colour, Shape, and Weight already exists.' });
    }

    // Apply normalized specs back to req.body so they are stored normalized
    Object.assign(req.body, specs);
    // Normalize name as well
    if (!req.body.name) {
      const nameParts = [];
      if (req.body.size) nameParts.push(req.body.size);
      if (req.body.shape) nameParts.push(req.body.shape);
      if (req.body.colour) nameParts.push(req.body.colour);
      req.body.name = nameParts.length > 0 ? nameParts.join(' ') : 'Unnamed Product';
    }

    const product = await Product.create(req.body);

    // Create corresponding Inventory record
    await Inventory.create({
      warehouse: 'Gotham Depot A',
      itemSku: product.sku,
      itemName: product.name,
      qty: product.stockLevel,
      minReorder: product.minReorder,
      val: product.price * product.stockLevel,
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/products/:id — Update product specifications
router.put('/:id', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot modify products.' });
    }
    const oldProduct = await Product.findById(req.params.id);
    if (!oldProduct) return res.status(404).json({ error: 'Product not found' });

    const specs = getNormalizedSpecs(req.body);
    // Check duplicate combination case-insensitively
    const existing = await Product.findOne(specs).collation({ locale: 'en', strength: 2 }).lean();
    if (existing && existing._id.toString() !== req.params.id) {
      return res.status(400).json({ error: 'A product with this combination of Type, Size, Colour, Shape, and Weight already exists.' });
    }

    // Apply normalized specs back to req.body so they are stored normalized
    Object.assign(req.body, specs);
    // Normalize name as well
    if (!req.body.name) {
      const nameParts = [];
      if (req.body.size) nameParts.push(req.body.size);
      if (req.body.shape) nameParts.push(req.body.shape);
      if (req.body.colour) nameParts.push(req.body.colour);
      req.body.name = nameParts.length > 0 ? nameParts.join(' ') : 'Unnamed Product';
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    // Update matching warehouse inventory entries (SKU mapping)
    await Inventory.updateMany(
      { itemSku: oldProduct.sku },
      {
        itemSku: req.body.sku || oldProduct.sku,
        itemName: req.body.name || oldProduct.name,
        minReorder: req.body.minReorder || oldProduct.minReorder,
        val: (req.body.price ?? oldProduct.price) * (req.body.stockLevel ?? oldProduct.stockLevel)
      }
    );

    res.json(updatedProduct);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — Remove product and its associated inventory entries
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete products.' });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Remove matching warehouse inventory entries
    await Inventory.deleteMany({ itemSku: product.sku });

    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/image — Upload product image to Cloudinary
router.post('/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    // Upload buffer to Cloudinary — returns a permanent CDN URL
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

// PATCH /api/products/:id/pricing — Update price, discount & promo banner (admin/manager only)
router.patch('/:id/pricing', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot modify pricing.' });
    }
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

    // Sync inventory value if price changed
    if (price !== undefined) {
      await Inventory.updateMany(
        { itemSku: updated.sku },
        { val: updated.price * updated.stockLevel }
      );
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
