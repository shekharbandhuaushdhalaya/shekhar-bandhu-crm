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

// Seed database on first run
async function seedDatabase() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    console.log('👤 Seeding database with initial users...');
    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);
    const managerPassword = await bcrypt.hash('manager123', salt);
    const agentPassword = await bcrypt.hash('agent123', salt);
    
    await User.insertMany([
      { name: 'Admin User', email: 'admin@shekharbandhu.com', password: adminPassword, role: 'admin', canAccessCash: true },
      { name: 'Manager User', email: 'manager@shekharbandhu.com', password: managerPassword, role: 'manager' },
      { name: 'Agent User', email: 'agent@shekharbandhu.com', password: agentPassword, role: 'agent' }
    ]);
    console.log('👤 Users seeded successfully');
  }

  // Seed default warehouse if none exists
  const Warehouse = require('./models/Warehouse');
  const warehouseCount = await Warehouse.countDocuments();
  if (warehouseCount === 0) {
    await Warehouse.create({
      name: "Varanasi Central Depot",
      location: "Varanasi, Uttar Pradesh",
      contactNo: "+91 62905 97810"
    });
    console.log('🏭 Warehouse seeded successfully');
  }

  console.log('📦 Checking and seeding Shekhar Bandhu Ayurvedic products...');
  const AyurvedicProducts = [
    {
      name: "ABHAYARISHTA",
      sku: "ASV-ABH-450-ROU",
      price: 120.00,
      stockLevel: 1000,
      category: "Asava & Arishta",
      minReorder: 20,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Asava & Arishta",
      size: "450ml",
      colour: "Brown",
      shape: "round",
      weight: "600g",
      description: "Classical self-fermented Ayurvedic formulation that acts as an effective colon cleanser, relieves constipation, and aids digestion.",
      disease: "Constipation, Piles, Indigestion"
    },
    {
      name: "MUSTAKARISTA",
      sku: "ASV-MUS-450-ROU",
      price: 130.00,
      stockLevel: 800,
      category: "Asava & Arishta",
      minReorder: 20,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Asava & Arishta",
      size: "450ml",
      colour: "Brown",
      shape: "round",
      weight: "600g",
      description: "Traditional digestive formula that helps regulate bowel movements, treats dyspepsia, and controls diarrhea.",
      disease: "IBS, Diarrhea, Indigestion"
    },
    {
      name: "GUGGULVASAVA",
      sku: "ASV-GUG-450-ROU",
      price: 150.00,
      stockLevel: 500,
      category: "Asava & Arishta",
      minReorder: 15,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Asava & Arishta",
      size: "450ml",
      colour: "Brown",
      shape: "round",
      weight: "600g",
      description: "Classical preparation of Guggulu and Vasica to support joint mobility, joint health, and purify blood toxins.",
      disease: "Arthritis, Gout, Joint Pain"
    },
    {
      name: "PHALASAV",
      sku: "ASV-PHA-450-ROU",
      price: 140.00,
      stockLevel: 600,
      category: "Asava & Arishta",
      minReorder: 15,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Asava & Arishta",
      size: "450ml",
      colour: "Brown",
      shape: "round",
      weight: "600g",
      description: "Nutritive herbal tonic designed to support female reproductive wellness, restore vitality, and build general immunity.",
      disease: "General Weakness, Female Infertility"
    },
    {
      name: "PUSHPASAV",
      sku: "ASV-PUS-450-ROU",
      price: 140.00,
      stockLevel: 600,
      category: "Asava & Arishta",
      minReorder: 15,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Asava & Arishta",
      size: "450ml",
      colour: "Brown",
      shape: "round",
      weight: "600g",
      description: "Traditional formulation helpful for menstrual discomfort, irregular cycles, leucorrhoea, and female hormonal balance.",
      disease: "Irregular Periods, Hormonal Imbalance"
    },
    {
      name: "S.B LIV SYRUP",
      sku: "SYR-LIV-200-ROU",
      price: 110.00,
      stockLevel: 1500,
      category: "Syrups",
      minReorder: 50,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Syrups",
      size: "200ml",
      colour: "Reddish Brown",
      shape: "round",
      weight: "250g",
      description: "Highly effective Ayurvedic liver tonic that protects liver cells, helps remove toxins, and improves appetite.",
      disease: "Liver Health, Jaundice, Loss of Appetite"
    },
    {
      name: "CEREPLEX",
      sku: "SYR-CER-200-ROU",
      price: 125.00,
      stockLevel: 1200,
      category: "Syrups",
      minReorder: 40,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Syrups",
      size: "200ml",
      colour: "Dark Brown",
      shape: "round",
      weight: "250g",
      description: "Premium brain tonic and memory booster formulated with Brahmi, Shankhpushpi, and other neuroprotective herbs.",
      disease: "Memory Loss, Brain Fatigue, Anxiety"
    },
    {
      name: "BASIL",
      sku: "SYR-BAS-100-ROU",
      price: 75.00,
      stockLevel: 2000,
      category: "Syrups",
      minReorder: 100,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Syrups",
      size: "100ml",
      colour: "Greenish Brown",
      shape: "round",
      weight: "130g",
      description: "Pure extract syrup of Tulsi (Basil) that builds respiratory defense, fights chronic coughs, and boosts general immunity.",
      disease: "Cough, Cold, Low Immunity"
    },
    {
      name: "KSHEER BALA OIL",
      sku: "OIL-KSH-100-ROU",
      price: 180.00,
      stockLevel: 800,
      category: "Medicated Oils",
      minReorder: 25,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Medicated Oils",
      size: "100ml",
      colour: "Yellow",
      shape: "round",
      weight: "120g",
      description: "Traditional medicated sesame oil processed with cow milk and Bala root, widely used for soothing joint and nerve massage.",
      disease: "Joint Stiffness, Neuromuscular Pain, Stress"
    },
    {
      name: "PRASARANITEL MASSAGE OIL",
      sku: "OIL-PRA-100-ROU",
      price: 190.00,
      stockLevel: 600,
      category: "Medicated Oils",
      minReorder: 20,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Medicated Oils",
      size: "100ml",
      colour: "Reddish Yellow",
      shape: "round",
      weight: "120g",
      description: "Medicated pain relief oil formulated to treat deep-seated muscle soreness, joint stiffness, and restore limb mobility.",
      disease: "Joint Stiffness, Sciatica, Rheumatism"
    },
    {
      name: "SHUDARSHAN OIL",
      sku: "OIL-SHU-50-ROU",
      price: 95.00,
      stockLevel: 1000,
      category: "Medicated Oils",
      minReorder: 30,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Medicated Oils",
      size: "50ml",
      colour: "Golden Yellow",
      shape: "round",
      weight: "70g",
      description: "Multi-purpose herbal oil for local pain relief, reducing swelling, and healing minor skin abrasions.",
      disease: "Local Pain, Swelling, Earache"
    },
    {
      name: "GASTERNA",
      sku: "VAT-GAS-60-TAB",
      price: 85.00,
      stockLevel: 1500,
      category: "Vati & Guggulu",
      minReorder: 50,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Blackish",
      shape: "flat",
      weight: "50g",
      description: "Ayurvedic digestive tablet that provides quick relief from bloating, flatulence, acidity, and gastric discomfort.",
      disease: "Acidity, Gas, Bloating"
    },
    {
      name: "PUSHKAR BRAHMI GUGGUL",
      sku: "VAT-PUS-60-TAB",
      price: 160.00,
      stockLevel: 1000,
      category: "Vati & Guggulu",
      minReorder: 30,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Dark Brown",
      shape: "flat",
      weight: "50g",
      description: "Specialized formulation that helps regulate blood pressure, supports healthy cardiovascular function, and relieves mental stress.",
      disease: "Hypertension, Heart Health, Stress"
    },
    {
      name: "ARSHOHIL",
      sku: "VAT-ARS-60-TAB",
      price: 140.00,
      stockLevel: 1200,
      category: "Vati & Guggulu",
      minReorder: 35,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Greyish Black",
      shape: "flat",
      weight: "50g",
      description: "Classical Ayurvedic tablet for relief from painful hemorrhoids, fissure discomfort, and rectal inflammation.",
      disease: "Piles, Hemorrhoids, Fissures"
    },
    {
      name: "AYULEX",
      sku: "VAT-AYU-60-TAB",
      price: 110.00,
      stockLevel: 1800,
      category: "Vati & Guggulu",
      minReorder: 50,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Brownish",
      shape: "flat",
      weight: "50g",
      description: "Mild herbal laxative tablet that promotes regular bowel movements without causing habituation or abdominal cramps.",
      disease: "Constipation, Irregular Bowels"
    },
    {
      name: "VASAVYAGHRI HARITAKI",
      sku: "AVL-VAS-250-JAR",
      price: 220.00,
      stockLevel: 500,
      category: "Avaleha",
      minReorder: 15,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Avaleha",
      size: "250g",
      colour: "Dark Brown Paste",
      shape: "jar",
      weight: "300g",
      description: "Avaleha (medicated paste) useful for treating respiratory congestion, bronchitis, persistent coughs, and throat irritation.",
      disease: "Asthma, Chronic Cough, Bronchitis"
    },
    {
      name: "LOTUS SYRUP",
      sku: "SYR-LOT-200-ROU",
      price: 130.00,
      stockLevel: 750,
      category: "Syrups",
      minReorder: 20,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Syrups",
      size: "200ml",
      colour: "Reddish Brown",
      shape: "round",
      weight: "250g",
      description: "Effective uterine tonic for women that helps regulate menstrual health, relieves fatigue, and supports hormonal balance.",
      disease: "Uterine Disorders, Menstrual Discomfort, Fatigue"
    },
    {
      name: "RELAXOFIT",
      sku: "VAT-REL-60-TAB",
      price: 145.00,
      stockLevel: 900,
      category: "Vati & Guggulu",
      minReorder: 30,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Brownish",
      shape: "flat",
      weight: "55g",
      description: "Herbal relaxant tablet designed to soothe nervous exhaustion, improve sleep quality, and relieve chronic mental stress.",
      disease: "Stress, Insomnia, Anxiety"
    },
    {
      name: "REDAN-RA",
      sku: "VAT-RED-60-TAB",
      price: 180.00,
      stockLevel: 600,
      category: "Vati & Guggulu",
      minReorder: 25,
      hsnCode: "30049011",
      gstRate: 12,
      productType: "Vati & Guggulu",
      size: "60 Tablets",
      colour: "Dark Grey",
      shape: "flat",
      weight: "50g",
      description: "Specialized anti-rheumatic formulation that reduces joint inflammation, alleviates muscular spasm, and supports bone health.",
      disease: "Rheumatoid Arthritis, Joint Pain, Muscle Spasms"
    }
  ];

  // Purge any legacy packaging products not in Shekhar Bandhu catalog
  const ayurvedicSkus = AyurvedicProducts.map(p => p.sku);
  const deleteProductsRes = await Product.deleteMany({ sku: { $nin: ayurvedicSkus } });
  const deleteInventoryRes = await Inventory.deleteMany({ itemSku: { $nin: ayurvedicSkus } });
  const InventoryEntry = require('./models/InventoryEntry');
  const StockLedger = require('./models/StockLedger');
  
  // Resolve valid product IDs
  const validProductIds = await Product.find({ sku: { $in: ayurvedicSkus } }).distinct('_id');
  const deleteEntriesRes = await InventoryEntry.deleteMany({ productId: { $nin: validProductIds } });
  const deleteLedgerRes = await StockLedger.deleteMany({ productId: { $nin: validProductIds } });
  
  console.log(`🧹 Purged legacy packaging data: ${deleteProductsRes.deletedCount} products, ${deleteInventoryRes.deletedCount} warehouse items, ${deleteEntriesRes.deletedCount} inventory slots, and ${deleteLedgerRes.deletedCount} stock ledgers.`);

  for (const p of AyurvedicProducts) {
    let prod = await Product.findOne({ sku: p.sku });
    if (!prod) {
      prod = await Product.create(p);
      // Create corresponding Inventory record if none exists
      const existingInv = await Inventory.findOne({ itemSku: prod.sku });
      if (!existingInv) {
        await Inventory.create({
          warehouse: 'Varanasi Central Depot',
          itemSku: prod.sku,
          itemName: prod.name,
          qty: prod.stockLevel,
          minReorder: prod.minReorder,
          val: prod.price * prod.stockLevel,
        });
      }
    } else {
      // Update description and disease properties
      prod.description = p.description;
      prod.disease = p.disease;
      await prod.save();
    }
  }
  console.log('📦 Shekhar Bandhu Ayurvedic products seeding verification complete');

  console.log('✅ Database seeded successfully');
}

// ─── Try MongoDB connection & start server ───
mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('🔌 Connected to MongoDB');
    const { router: authRoutes } = require('./routes/auth');
    app.use('/api/auth', authRoutes);

    app.get('/api/public/products', async (req, res) => {
      try {
        const Product        = require('./models/Product');
        const Warehouse      = require('./models/Warehouse');
        const InventoryEntry = require('./models/InventoryEntry');

        // Find the primary warehouse (Varanasi Central Depot)
        const warehouse = await Warehouse.findOne({ name: /varanasi central/i }).lean();

        // Fetch all inventory entries for that warehouse (if found)
        let stockMap = {};
        if (warehouse) {
          const entries = await InventoryEntry.find({ warehouseId: warehouse._id }).lean();
          for (const entry of entries) {
            const pid = entry.productId.toString();
            stockMap[pid] = (stockMap[pid] || 0) + (entry.qtyBoxes || 0);
          }
        }

        const products = await Product.find({}).sort({ name: 1 }).lean();

        // Attach live inventory qty to each product
        const enriched = products.map(p => ({
          ...p,
          inventoryQty: stockMap[p._id.toString()] ?? p.stockLevel ?? 0,
        }));

        res.json(enriched);
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
      const Payment = require('./models/Payment');
      await Payment.collection.dropIndex('paymentNo_1');
      console.log('✅ Dropped old paymentNo index from payments collection');
    } catch (_) { }
    await require('./models/InventoryEntry').syncIndexes();
    console.log('✅ Using MongoDB for data');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 VP-CRM Server running on port ${PORT} (bound to 0.0.0.0)`);
    });
  })
  .catch(err => {
    console.error('❌ Critical Error: MongoDB connection failed! Exiting server...');
    console.error(err.message);
    process.exit(1);
  });

