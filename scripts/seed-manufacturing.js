/**
 * Seed script: Manufacturing → Finished Goods flow
 *
 * Run with: node scripts/seed-manufacturing.js
 * Requires MongoDB running at mongodb://localhost:27017/shekhar-bandhu-crm
 *
 * This creates:
 *   1. Warehouse (Varanasi Central Depot)
 *   2. Raw materials (Ayurvedic herbs/jaggery/honey)
 *   3. Raw material stock entries (inward)
 *   4. Finished products (Chyawanprash, Triphala, Ashwagandha)
 *   5. Bill of Materials (BOM) linking raw materials → products
 *   6. Starts batch production, advances all stages, completes QC
 */

const mongoose = require('mongoose');
const config = require('../server/src/config');

const Warehouse = require('../server/models/Warehouse');
const RawMaterial = require('../server/models/RawMaterial');
const RawMaterialEntry = require('../server/models/RawMaterialEntry');
const Product = require('../server/models/Product');
const Inventory = require('../server/models/Inventory');
const BillOfMaterials = require('../server/models/BillOfMaterials');
const BatchProduction = require('../server/models/BatchProduction');
const InventoryEntry = require('../server/models/InventoryEntry');
const StockLedger = require('../server/models/StockLedger');

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri);
  console.log(`Connected to ${config.mongoUri}\n`);

  // ──────────────────────────────────────────────────
  // 1. WAREHOUSE (upsert — never deletes existing)
  // ──────────────────────────────────────────────────
  console.log('─── 1. Finding/Creating Warehouse ───');
  let warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
  if (!warehouse) {
    warehouse = await Warehouse.create({
      name: 'Primary Warehouse',
      addressLine1: 'Plot No. 42, Industrial Area',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      pincode: '221002',
      contactPerson: 'Mr. Sharma',
      phone: '+91-9876543210',
    });
    console.log(`  ✅ Created warehouse: ${warehouse.name} (${warehouse._id})`);
  } else {
    console.log(`  ✅ Using existing warehouse: ${warehouse.name} (${warehouse._id})`);
  }
  console.log();

  // ──────────────────────────────────────────────────
  // 2. RAW MATERIALS
  // ──────────────────────────────────────────────────
  console.log('─── 2. Creating Raw Materials (upsert) ───');
  const rawMaterialDefs = [
    { name: 'Amla (Indian Gooseberry) Powder', sku: 'RM-AMLA-001', unit: 'kg' },
    { name: 'Haritaki Powder',                sku: 'RM-HARITAKI-001', unit: 'kg' },
    { name: 'Bibhitaki Powder',               sku: 'RM-BIBHITAKI-001', unit: 'kg' },
    { name: 'Ashwagandha Root Powder',        sku: 'RM-ASHWAGANDHA-001', unit: 'kg' },
    { name: 'Jaggery (Gud)',                  sku: 'RM-JAGGERY-001', unit: 'kg' },
    { name: 'Honey',                          sku: 'RM-HONEY-001', unit: 'l' },
    { name: 'Cow Ghee',                       sku: 'RM-GHEE-001', unit: 'l' },
    { name: 'Shatavari Root Powder',          sku: 'RM-SHATAVARI-001', unit: 'kg' },
    { name: 'Cardamom Powder',                sku: 'RM-CARDAMOM-001', unit: 'kg' },
    { name: 'Cinnamon Powder',                sku: 'RM-CINNAMON-001', unit: 'kg' },
  ];
  const rawMaterials = [];
  for (const def of rawMaterialDefs) {
    const rm = await RawMaterial.findOneAndUpdate(
      { sku: def.sku },
      { $set: def },
      { upsert: true, new: true }
    );
    rawMaterials.push(rm);
    console.log(`  ✅ ${rm.name} (${rm.sku}) — unit: ${rm.unit}`);
  }
  console.log();

  // ──────────────────────────────────────────────────
  // 3. RAW MATERIAL STOCK (Inward Entries)
  // ──────────────────────────────────────────────────
  console.log('─── 3. Inward Raw Material Stock ───');
  const rmEntries = [];
  const stockData = [
    { rmIdx: 0, qty: 500,  rate: 180,  batch: 'B-AMLA-001', vendor: 'HerbEx India' },
    { rmIdx: 1, qty: 300,  rate: 120,  batch: 'B-HAR-001',   vendor: 'AyuHerbs Ltd' },
    { rmIdx: 2, qty: 300,  rate: 110,  batch: 'B-BIB-001',   vendor: 'AyuHerbs Ltd' },
    { rmIdx: 3, qty: 200,  rate: 450,  batch: 'B-ASHWA-001', vendor: 'Roots & Herbs' },
    { rmIdx: 4, qty: 1000, rate: 60,   batch: 'B-GUD-001',   vendor: 'Organic Farmers Co-op' },
    { rmIdx: 5, qty: 200,  rate: 250,  batch: 'B-HONEY-001', vendor: 'Natural Bee Farms' },
    { rmIdx: 6, qty: 100,  rate: 550,  batch: 'B-GHEE-001',  vendor: 'Deshi Dairy' },
    { rmIdx: 7, qty: 150,  rate: 380,  batch: 'B-SHAT-001',  vendor: 'Roots & Herbs' },
    { rmIdx: 8, qty: 25,   rate: 1200, batch: 'B-CARD-001',  vendor: 'Spice Paradise' },
    { rmIdx: 9, qty: 30,   rate: 900,  batch: 'B-CINN-001',  vendor: 'Spice Paradise' },
  ];
  for (const s of stockData) {
    const entry = await RawMaterialEntry.create({
      rawMaterialId: rawMaterials[s.rmIdx]._id,
      batchNo: s.batch,
      qty: s.qty,
      purchaseRate: s.rate,
      vendorName: s.vendor,
      expiryDate: new Date('2027-12-31'),
    });
    rmEntries.push(entry);
    console.log(`  ✅ ${rawMaterials[s.rmIdx].name}: ${s.qty} ${rawMaterials[s.rmIdx].unit} @ ₹${s.rate}/${rawMaterials[s.rmIdx].unit} (batch: ${s.batch})`);
  }
  console.log();

  // ──────────────────────────────────────────────────
  // 4. FINISHED PRODUCTS
  // ──────────────────────────────────────────────────
  console.log('─── 4. Creating Finished Products (upsert) ───');
  const productDefs = [
    {
      name: 'Shekhar Bandhu Chyawanprash',
      sku: 'SB-CHYAWAN-500',
      price: 350,
      category: 'Ayurvedic Health Supplement',
      hsnCode: '30049011',
      gstRate: 12,
      productType: 'Jam',
      size: '500g',
      description: 'Traditional Ayurvedic health tonic with Amla as base',
      stockLevel: 0,
    },
    {
      name: 'Shekhar Bandhu Triphala Powder',
      sku: 'SB-TRIPHALA-100',
      price: 120,
      category: 'Ayurvedic Powder',
      hsnCode: '30049011',
      gstRate: 12,
      productType: 'Powder',
      size: '100g',
      description: 'Classic Triphala formulation — Haritaki, Bibhitaki, Amla',
      stockLevel: 0,
    },
    {
      name: 'Shekhar Bandhu Ashwagandha Capsules',
      sku: 'SB-ASHWA-60',
      price: 280,
      category: 'Ayurvedic Supplement',
      hsnCode: '30049011',
      gstRate: 12,
      productType: 'Capsules',
      size: '60 Capsules',
      description: 'Standardized Ashwagandha root extract for stress relief',
      stockLevel: 0,
    },
  ];
  const products = [];
  for (const def of productDefs) {
    const p = await Product.findOneAndUpdate(
      { sku: def.sku },
      { $set: def },
      { upsert: true, new: true }
    );
    // Also create legacy Inventory record if not exists
    const existingInv = await Inventory.findOne({ itemSku: p.sku });
    if (!existingInv) {
      await Inventory.create({
        itemSku: p.sku,
        itemName: p.name,
        qty: 0,
        minReorder: 10,
      });
    }
    products.push(p);
    console.log(`  ✅ ${p.name} (${p.sku}) — ₹${p.price}`);
  }
  console.log();

  // ──────────────────────────────────────────────────
  // 5. BILL OF MATERIALS (BOM)
  // ──────────────────────────────────────────────────
  console.log('─── 5. Creating Bill of Materials (upsert) ───');

  async function upsertBOM(productId, batchYieldSize, ingredients) {
    return BillOfMaterials.findOneAndUpdate(
      { productId },
      { $setOnInsert: { productId, batchYieldSize, ingredients } },
      { upsert: true, new: true }
    );
  }

  // BOM for Chyawanprash (batch yield = 100 jars of 500g each)
  const bomChyawan = await upsertBOM(products[0]._id, 100, [
    { rawMaterialId: rawMaterials[0]._id, qtyRequired: 25 },  // Amla powder: 25 kg
    { rawMaterialId: rawMaterials[4]._id, qtyRequired: 40 },  // Jaggery: 40 kg
    { rawMaterialId: rawMaterials[5]._id, qtyRequired: 10 },  // Honey: 10 l
    { rawMaterialId: rawMaterials[6]._id, qtyRequired: 5 },   // Ghee: 5 l
    { rawMaterialId: rawMaterials[8]._id, qtyRequired: 0.5 }, // Cardamom: 0.5 kg
    { rawMaterialId: rawMaterials[9]._id, qtyRequired: 0.3 }, // Cinnamon: 0.3 kg
  ]);
  console.log(`  ✅ BOM: ${products[0].name} (yield: ${bomChyawan.batchYieldSize} units)`);
  console.log(`     Ingredients:`);
  for (const ing of bomChyawan.ingredients) {
    const rm = rawMaterials.find(r => r._id.equals(ing.rawMaterialId));
    console.log(`       - ${rm.name}: ${ing.qtyRequired} ${rm.unit}`);
  }

  // BOM for Triphala Powder (batch yield = 200 pouches of 100g each)
  const bomTriphala = await upsertBOM(products[1]._id, 200, [
    { rawMaterialId: rawMaterials[0]._id, qtyRequired: 8 },   // Amla: 8 kg
    { rawMaterialId: rawMaterials[1]._id, qtyRequired: 8 },   // Haritaki: 8 kg
    { rawMaterialId: rawMaterials[2]._id, qtyRequired: 8 },   // Bibhitaki: 8 kg
  ]);
  console.log(`  ✅ BOM: ${products[1].name} (yield: ${bomTriphala.batchYieldSize} units)`);
  for (const ing of bomTriphala.ingredients) {
    const rm = rawMaterials.find(r => r._id.equals(ing.rawMaterialId));
    console.log(`     - ${rm.name}: ${ing.qtyRequired} ${rm.unit}`);
  }

  // BOM for Ashwagandha Capsules (batch yield = 1000 capsules)
  const bomAshwa = await upsertBOM(products[2]._id, 1000, [
    { rawMaterialId: rawMaterials[3]._id, qtyRequired: 5 },   // Ashwagandha: 5 kg
    { rawMaterialId: rawMaterials[7]._id, qtyRequired: 2 },   // Shatavari: 2 kg
  ]);
  console.log(`  ✅ BOM: ${products[2].name} (yield: ${bomAshwa.batchYieldSize} units)`);
  for (const ing of bomAshwa.ingredients) {
    const rm = rawMaterials.find(r => r._id.equals(ing.rawMaterialId));
    console.log(`     - ${rm.name}: ${ing.qtyRequired} ${rm.unit}`);
  }
  console.log();

  // ──────────────────────────────────────────────────
  // 6. START BATCH PRODUCTION
  // ──────────────────────────────────────────────────
  console.log('─── 6. Starting Batch Production ───');

  // Start Chyawanprash batch
  const batchBP = await (async function startBatch(product, plannedQty, batchNo) {
    const bom = await BillOfMaterials.findOne({ productId: product._id });
    if (!bom) throw new Error(`No BOM found for ${product.name}`);

    // Check and deduct raw material stock (FEFO: earliest expiry first)
    const ingredientsConsumed = [];
    let totalCost = 0;

    for (const ing of bom.ingredients) {
      let qtyNeeded = (ing.qtyRequired / bom.batchYieldSize) * plannedQty;

      // Get available entries sorted by expiry (FEFO)
      const entries = await RawMaterialEntry.find({
        rawMaterialId: ing.rawMaterialId,
        qty: { $gt: 0 },
      }).sort({ expiryDate: 1, createdAt: 1 });

      let qtyConsumed = 0;
      for (const entry of entries) {
        if (qtyNeeded <= 0) break;
        const take = Math.min(qtyNeeded, entry.qty);
        entry.qty -= take;
        await entry.save();

        ingredientsConsumed.push({
          rawMaterialId: ing.rawMaterialId,
          rawMaterialEntryId: entry._id,
          qtyConsumed: take,
          batchNo: entry.batchNo,
        });

        totalCost += take * entry.purchaseRate;
        qtyConsumed += take;
        qtyNeeded -= take;
      }

      if (qtyNeeded > 0.01) {
        const rm = await RawMaterial.findById(ing.rawMaterialId);
        throw new Error(`Insufficient stock: need ${qtyNeeded.toFixed(2)} more of ${rm.name} (${rm.sku})`);
      }
    }

    const existing = await BatchProduction.findOne({ batchNo });
    if (existing) {
      console.log(`  ⏭  Batch ${batchNo} already exists, skipping`);
      return existing;
    }

    const batch = await BatchProduction.create({
      batchNo,
      productId: product._id,
      plannedQty,
      status: 'in_progress',
      stages: BatchProduction.MANUFACTURING_STAGES.map((name, i) => ({
        name,
        status: i === 0 ? 'in_progress' : 'pending',
        startedAt: i === 0 ? new Date() : null,
      })),
      startDate: new Date(),
      ingredientsConsumed,
      rawMaterialCost: totalCost,
    });

    console.log(`  ✅ Batch ${batch.batchNo} started for ${product.name}`);
    console.log(`     Planned: ${plannedQty} units, Raw material cost: ₹${totalCost.toFixed(2)}`);
    return batch;
  })(products[0], 100, 'BP-CHYAWAN-001');

  // ──────────────────────────────────────────────────
  // 7. ADVANCE ALL STAGES
  // ──────────────────────────────────────────────────
  console.log(`\n─── 7. Advancing Manufacturing Stages ───`);

  const stageNames = BatchProduction.MANUFACTURING_STAGES;
  for (let i = 0; i < stageNames.length; i++) {
    const stage = batchBP.stages[i];

    // Mark current as completed
    stage.status = 'completed';
    stage.completedAt = new Date();
    stage.completedBy = 'Seed Script';
    stage.notes = `Completed via seed script — ${stageNames[i]}`;

    // Advance next stage to in_progress
    if (i + 1 < stageNames.length) {
      batchBP.stages[i + 1].status = 'in_progress';
      batchBP.stages[i + 1].startedAt = new Date();
    }

    console.log(`  ✅ Stage ${i + 1}/${stageNames.length}: ${stageNames[i]} → completed`);
  }

  // All stages done → set batch to qc_hold
  batchBP.status = 'qc_hold';
  await batchBP.save();
  console.log(`  ✅ Batch status → qc_hold (all stages completed)`);

  // ──────────────────────────────────────────────────
  // 8. COMPLETE BATCH (QC + INWARD FINISHED GOODS)
  // ──────────────────────────────────────────────────
  console.log(`\n─── 8. QC Sign-off & Inward Finished Goods ───`);

  const actualYieldQty = 98;  // 98 jars (2 units shrinkage)
  const packing = 1;          // 1 jar per box
  const boxes = Math.ceil(actualYieldQty / packing);
  const packingSize = packing;

  // Create/update InventoryEntry
  let finEntry = await InventoryEntry.findOne({
    warehouseId: warehouse._id,
    productId: products[0]._id,
    batchNo: batchBP.batchNo,
  });

  if (finEntry) {
    finEntry.qtyBoxes += boxes;
  } else {
    finEntry = await InventoryEntry.create({
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      productId: products[0]._id,
      productType: products[0].productType || '',
      size: products[0].size || '',
      colour: products[0].colour || '',
      shape: products[0].shape || '',
      weight: products[0].weight || '',
      hsnCode: products[0].hsnCode || '',
      qtyBoxes: boxes,
      packing: packingSize,
      batchNo: batchBP.batchNo,
      mfgDate: new Date(),
      expiryDate: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
    });
  }

  // Update Product stockLevel (in boxes)
  products[0].stockLevel += boxes;
  await products[0].save();

  // Update legacy Inventory
  const inv = await Inventory.findOne({ itemSku: products[0].sku });
  if (inv) {
    inv.qty += boxes;
    inv.val = inv.qty * products[0].price;
    await inv.save();
  }

  // Record StockLedger
  await StockLedger.create({
    productId: products[0]._id,
    warehouseId: warehouse._id,
    warehouseName: warehouse.name,
    type: 'IN',
    qtyBoxes: boxes,
    balanceBoxes: finEntry.qtyBoxes,
    reference: `Production Batch ${batchBP.batchNo}`,
    note: `Inwarded from Batch Production via seed script`,
    createdBy: 'Seed Script',
    packing: packingSize,
    batchNo: batchBP.batchNo,
  });

  // Update batch record
  const wasteQty = batchBP.plannedQty - actualYieldQty;
  const variancePct = Number((((actualYieldQty - batchBP.plannedQty) / batchBP.plannedQty) * 100).toFixed(2));
  const unitCost = actualYieldQty > 0 ? Number((batchBP.rawMaterialCost / actualYieldQty).toFixed(2)) : 0;

  batchBP.actualYieldQty = actualYieldQty;
  batchBP.wasteQty = wasteQty;
  batchBP.wasteReason = 'Natural drying shrinkage';
  batchBP.variancePercent = variancePct;
  batchBP.unitProductionCost = unitCost;
  batchBP.qcNotes = 'Passed QC — Batch approved for sale';
  batchBP.qcPassedBy = 'Dr. P. K. Sharma';
  batchBP.status = 'completed';
  batchBP.endDate = new Date();
  await batchBP.save();

  console.log(`  ✅ Batch ${batchBP.batchNo} COMPLETED`);
  console.log(`     Planned: ${batchBP.plannedQty} → Yielded: ${actualYieldQty} units (${boxes} boxes of ${packingSize})`);
  console.log(`     Waste: ${wasteQty} units (${batchBP.wasteReason})`);
  console.log(`     Variance: ${variancePct}%`);
  console.log(`     Unit cost: ₹${unitCost}/unit`);
  console.log(`     Stock added: ${boxes} boxes of ${products[0].name} in ${warehouse.name}`);
  console.log(`     New stockLevel: ${products[0].stockLevel} boxes`);

  // ──────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────
  console.log(`\n─── SEED COMPLETE ───`);
  console.log(`\n📦 Warehouse: ${warehouse.name}`);
  console.log(`🌿 Raw Materials: ${rawMaterials.length} definitions`);
  console.log(`📥 Raw Material Stock: ${rmEntries.length} inward entries`);
  console.log(`🏭 Finished Products: ${products.length} products`);
  console.log(`📋 Bill of Materials: ${3} BOMs`);
  console.log(`🔄 Batch Production: ${batchBP.batchNo} — completed`);

  const finalStock = await InventoryEntry.find({ productId: products[0]._id }).lean();
  console.log(`\n📊 Final Inventory for ${products[0].name}:`);
  for (const s of finalStock) {
    console.log(`   ${s.batchNo}: ${s.qtyBoxes} boxes × ${s.packing} pcs/box = ${s.qtyBoxes * s.packing} pcs`);
  }

  const productAfter = await Product.findById(products[0]._id).lean();
  console.log(`   Product.stockLevel: ${productAfter.stockLevel} boxes`);

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
