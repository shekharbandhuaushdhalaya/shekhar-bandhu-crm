require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const compression = require('compression');

const contactRoutes = require('./routes/contacts');
const taskRoutes = require('./routes/tasks');
const dashboardRoutes = require('./routes/dashboard');
const customerRoutes = require('./routes/customers');
const vendorRoutes = require('./routes/vendors');
const productRoutes = require('./routes/products');
const challanRoutes = require('./routes/challans');
const inventoryRoutes = require('./routes/inventories');
const invoiceRoutes = require('./routes/invoices');
const quotationRoutes = require('./routes/quotations');
const warehouseRoutes = require('./routes/warehouses');
const inventoryEntryRoutes = require('./routes/inventory-entries');
const paymentRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const queryRoutes = require('./routes/queries');
const orderRoutes = require('./routes/orders');


// — Seed data models —
const Contact = require('./models/Contact');
const Task = require('./models/Task');
const Activity = require('./models/Activity');
const User = require('./models/User');
const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Product = require('./models/Product');
const Challan = require('./models/Challan');
const Inventory = require('./models/Inventory');
const Invoice = require('./models/Invoice');
const Warehouse = require('./models/Warehouse');
const InventoryEntry = require('./models/InventoryEntry');
const StockLedger = require('./models/StockLedger');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-crm';
const JWT_SECRET = process.env.JWT_SECRET || 'vp_crm_secret_key_2026';

// Middleware to verify JWT token
function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

const { seedDatabase } = require('./utils/seed');

// ─── Try MongoDB connection & start server ───
mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('🔌 Connected to MongoDB');
    const { router: authRoutes } = require('./routes/auth');
    app.use('/api/auth', authRoutes);

    app.get('/api/public/products', async (req, res) => {
      try {
        const Product = require('./models/Product');
        const InventoryEntry = require('./models/InventoryEntry');

        const products = await Product.find({}).sort({ name: 1 }).lean();
        const entries = await InventoryEntry.find({}).lean();

        // Create a lookup map of productId -> totalUnits (qtyBoxes * packing)
        const inventoryMap = {};
        entries.forEach(entry => {
          const qty = Number(entry.qtyBoxes) || 0;
          const packing = Number(entry.packing) || 1;
          const units = qty * packing;
          const prodId = entry.productId ? entry.productId.toString() : '';
          if (prodId) {
            inventoryMap[prodId] = (inventoryMap[prodId] || 0) + units;
          }
        });

        // Attach live inventory qty to each product (falling back to stockLevel if missing)
        const enriched = products.map(p => {
          const prodId = p._id.toString();
          return {
            ...p,
            inventoryQty: inventoryMap[prodId] !== undefined ? inventoryMap[prodId] : (p.stockLevel || 0),
          };
        });

        res.json(enriched);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/public/products/:id/rate', async (req, res) => {
      try {
        const { rating } = req.body;
        const val = Number(rating);
        if (isNaN(val) || val < 1 || val > 5) {
          return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
        }

        const Product = require('./models/Product');
        const product = await Product.findById(req.params.id);
        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        // Calculate new running average rating
        const currentCount = product.ratingCount || 0;
        const currentAvg = product.rating || 0;
        const newCount = currentCount + 1;
        const newAvg = ((currentAvg * currentCount) + val) / newCount;

        product.rating = Math.round(newAvg * 10) / 10; // round to 1 decimal place
        product.ratingCount = newCount;
        await product.save();

        res.json({ rating: product.rating, ratingCount: product.ratingCount });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.use('/api/contacts', authenticateJWT, contactRoutes);
    app.use('/api/tasks', authenticateJWT, taskRoutes);
    app.use('/api/dashboard', authenticateJWT, dashboardRoutes);
    app.use('/api/customers', authenticateJWT, customerRoutes);
    app.use('/api/vendors', authenticateJWT, vendorRoutes);
    app.use('/api/products', authenticateJWT, productRoutes);
    app.use('/api/challans', authenticateJWT, challanRoutes);
    app.use('/api/inventories', authenticateJWT, inventoryRoutes);
    app.use('/api/invoices', authenticateJWT, invoiceRoutes);
    app.use('/api/quotations', authenticateJWT, quotationRoutes);
    app.use('/api/warehouses', authenticateJWT, warehouseRoutes);
    app.use('/api/inventory-entries', authenticateJWT, inventoryEntryRoutes);
    app.use('/api/payments', authenticateJWT, paymentRoutes);
    app.use('/api/analytics', authenticateJWT, analyticsRoutes);
    app.use('/api/public/queries', queryRoutes);
    app.use('/api/queries', authenticateJWT, queryRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/public/orders', orderRoutes); // alias public path
    
    // Drop old unique products index if it exists before seeding duplicate specs
    try {
      const Product = require('./models/Product');
      await Product.collection.dropIndex('productType_1_size_1_colour_1_shape_1_weight_1');
      console.log('✅ Dropped unique product characteristics index');
    } catch (_) { }
    
    await seedDatabase();
    // Drop the old 3-field unique index (warehouseId+productId+packing) if it still exists,
    // so Mongoose can create the new 4-field index (+ vendorId) without conflict.
    try {
      const InventoryEntry = require('./models/InventoryEntry');
      await InventoryEntry.collection.dropIndex('warehouseId_1_productId_1_packing_1');
      console.log('✅ Dropped old inventory index — new vendorId-aware index will be created');
    } catch (_) {
      // Index didn't exist — nothing to do
    }
    try {
      const InventoryEntry = require('./models/InventoryEntry');
      await InventoryEntry.collection.dropIndex('warehouseId_1_productId_1_vendorId_1_packing_1');
      console.log('✅ Dropped 4-field inventory index — new batchNo-aware index will be created');
    } catch (_) {
      // Index didn't exist — nothing to do
    }
    try {
      const Payment = require('./models/Payment');
      await Payment.collection.dropIndex('paymentNo_1');
      console.log('✅ Dropped old paymentNo index from payments collection');
    } catch (_) { }
    await require('./models/InventoryEntry').syncIndexes();
    console.log('✅ Using MongoDB for data');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Shekhar Bandhu CRM Server running on port ${PORT} (bound to 0.0.0.0)`);
    });
  })
  .catch(err => {
    console.error('❌ Critical Error: MongoDB connection failed! Exiting server...');
    console.error(err.message);
    process.exit(1);
  });

