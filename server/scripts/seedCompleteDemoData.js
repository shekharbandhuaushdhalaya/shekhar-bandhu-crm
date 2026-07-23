require('dotenv').config();
const config = require('../src/config');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load Mongoose Models
const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const MedicalRepresentative = require('../models/MedicalRepresentative');
const MrDailyLog = require('../models/MrDailyLog');
const MrVisit = require('../models/MrVisit');
const MrExpense = require('../models/MrExpense');
const BatchProduction = require('../models/BatchProduction');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const CreditNote = require('../models/CreditNote');
const Challan = require('../models/Challan');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const Contact = require('../models/Contact');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Quotation = require('../models/Quotation');
const Dispatch = require('../models/Dispatch');
const Complaint = require('../models/Complaint');
const Campaign = require('../models/Campaign');
const SalesTarget = require('../models/SalesTarget');
const BillOfMaterials = require('../models/BillOfMaterials');

async function seedCompleteDemoData() {
  try {
    console.log('🌱 Starting Complete Shekhar Bandhu CRM Full Data Seeding...');

    // 1. Warehouse
    let wh = await Warehouse.findOne();
    if (!wh) {
      wh = await Warehouse.create({
        name: "Varanasi Central Depot",
        addressLine1: "Shekhar Bandhu Aushadhalaya, Chetganj",
        city: "Varanasi",
        state: "Uttar Pradesh",
        pincode: "221005",
        contactPerson: "Store Manager",
        phone: "+91 94152 00000"
      });
      console.log('✅ Warehouse created:', wh.name);
    }

    // 2. Users & Roles
    const salt = await bcrypt.genSalt(10);
    const pass = await bcrypt.hash('admin123', salt);

    const adminUser = await User.findOneAndUpdate(
      { email: 'admin@shekharbandhu.com' },
      { name: 'Dr. Shekhar Bandhu (Admin)', email: 'admin@shekharbandhu.com', password: pass, role: 'admin', canAccessCash: true, mustChangePassword: false },
      { upsert: true, new: true }
    );

    const mrEmails = ['rahul.mr@shekharbandhu.com', 'priya.mr@shekharbandhu.com'];
    for (const email of mrEmails) {
      await User.findOneAndUpdate(
        { email },
        { name: email.includes('rahul') ? 'Rahul Verma' : 'Priya Sharma', email, password: pass, role: 'medical_rep', canAccessCash: true, mustChangePassword: false },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Users seeded');

    // 3. Products — All 19 Classical Ayurvedic Products with Stock Levels
    const productsData = [
      { name: "ABHAYARISHTA", sku: "ASV-ABH-450-ROU", price: 120, stockLevel: 250, category: "Asava & Arishta", hsnCode: "30049011", gstRate: 12, size: "450ml", colour: "Brown", shape: "round", weight: "600g", description: "Colon cleanser & digestion arishta.", disease: "Constipation, Piles" },
      { name: "MUSTAKARISTA", sku: "ASV-MUS-450-ROU", price: 130, stockLevel: 180, category: "Asava & Arishta", hsnCode: "30049011", gstRate: 12, size: "450ml", colour: "Brown", shape: "round", weight: "600g", description: "Digestive formula for bowel regulation.", disease: "IBS, Diarrhea" },
      { name: "GUGGULVASAVA", sku: "ASV-GUG-450-ROU", price: 150, stockLevel: 120, category: "Asava & Arishta", hsnCode: "30049011", gstRate: 12, size: "450ml", colour: "Brown", shape: "round", weight: "600g", description: "Joint mobility and blood toxin purifier.", disease: "Arthritis, Joint Pain" },
      { name: "PHALASAV", sku: "ASV-PHA-450-ROU", price: 140, stockLevel: 140, category: "Asava & Arishta", hsnCode: "30049011", gstRate: 12, size: "450ml", colour: "Brown", shape: "round", weight: "600g", description: "Female reproductive wellness & vitality tonic.", disease: "General Weakness" },
      { name: "PUSHPASAV", sku: "ASV-PUS-450-ROU", price: 140, stockLevel: 160, category: "Asava & Arishta", hsnCode: "30049011", gstRate: 12, size: "450ml", colour: "Brown", shape: "round", weight: "600g", description: "Menstrual comfort & hormonal balance syrup.", disease: "Hormonal Imbalance" },
      { name: "S.B LIV SYRUP", sku: "SYR-LIV-200-ROU", price: 110, stockLevel: 450, category: "Syrups", hsnCode: "30049011", gstRate: 12, size: "200ml", colour: "Reddish Brown", shape: "round", weight: "250g", description: "Ayurvedic liver protective tonic.", disease: "Jaundice, Liver Health" },
      { name: "CEREPLEX", sku: "SYR-CER-200-ROU", price: 125, stockLevel: 300, category: "Syrups", hsnCode: "30049011", gstRate: 12, size: "200ml", colour: "Dark Brown", shape: "round", weight: "250g", description: "Neuroprotective brain tonic with Brahmi.", disease: "Brain Fatigue, Memory Loss" },
      { name: "BASIL", sku: "SYR-BAS-100-ROU", price: 75, stockLevel: 500, category: "Syrups", hsnCode: "30049011", gstRate: 12, size: "100ml", colour: "Greenish Brown", shape: "round", weight: "130g", description: "Pure Tulsi respiratory defense syrup.", disease: "Cough, Cold" },
      { name: "KSHEER BALA OIL", sku: "OIL-KSH-100-ROU", price: 180, stockLevel: 210, category: "Medicated Oils", hsnCode: "30049011", gstRate: 12, size: "100ml", colour: "Yellow", shape: "round", weight: "120g", description: "Nerve & joint soothing sesame oil.", disease: "Neuromuscular Pain" },
      { name: "PRASARANITEL MASSAGE OIL", sku: "OIL-PRA-100-ROU", price: 190, stockLevel: 175, category: "Medicated Oils", hsnCode: "30049011", gstRate: 12, size: "100ml", colour: "Reddish Yellow", shape: "round", weight: "120g", description: "Pain relief oil for muscle soreness.", disease: "Sciatica, Rheumatism" },
      { name: "SHUDARSHAN OIL", sku: "OIL-SHU-50-ROU", price: 95, stockLevel: 220, category: "Medicated Oils", hsnCode: "30049011", gstRate: 12, size: "50ml", colour: "Golden Yellow", shape: "round", weight: "70g", description: "Multi-purpose herbal pain relief oil.", disease: "Swelling, Local Pain" },
      { name: "GASTERNA", sku: "VAT-GAS-60-TAB", price: 85, stockLevel: 600, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Blackish", shape: "flat", weight: "50g", description: "Quick relief from acidity & gas.", disease: "Acidity, Gas" },
      { name: "PUSHKAR BRAHMI GUGGUL", sku: "VAT-PUS-60-TAB", price: 160, stockLevel: 200, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Dark Brown", shape: "flat", weight: "50g", description: "Cardiovascular & blood pressure support.", disease: "Hypertension, Stress" },
      { name: "ARSHOHIL", sku: "VAT-ARS-60-TAB", price: 140, stockLevel: 240, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Greyish Black", shape: "flat", weight: "50g", description: "Relief for hemorrhoids & fissure discomfort.", disease: "Piles, Hemorrhoids" },
      { name: "AYULEX", sku: "VAT-AYU-60-TAB", price: 110, stockLevel: 350, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Brownish", shape: "flat", weight: "50g", description: "Mild herbal non-habitual laxative.", disease: "Constipation" },
      { name: "VASAVYAGHRI HARITAKI", sku: "AVL-VAS-250-JAR", price: 220, stockLevel: 190, category: "Avaleha", hsnCode: "30049011", gstRate: 12, size: "250g", colour: "Dark Brown Paste", shape: "jar", weight: "300g", description: "Respiratory congestion haritaki paste.", disease: "Asthma, Cough" },
      { name: "LOTUS SYRUP", sku: "SYR-LOT-200-ROU", price: 130, stockLevel: 220, category: "Syrups", hsnCode: "30049011", gstRate: 12, size: "200ml", colour: "Reddish Brown", shape: "round", weight: "250g", description: "Uterine wellness & menstrual balance syrup.", disease: "Uterine Disorders" },
      { name: "RELAXOFIT", sku: "VAT-REL-60-TAB", price: 145, stockLevel: 280, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Brownish", shape: "flat", weight: "55g", description: "Herbal sleep & stress relaxant tablet.", disease: "Insomnia, Anxiety" },
      { name: "REDAN-RA", sku: "VAT-RED-60-TAB", price: 180, stockLevel: 170, category: "Vati & Guggulu", hsnCode: "30049011", gstRate: 12, size: "60 Tablets", colour: "Dark Grey", shape: "flat", weight: "50g", description: "Anti-rheumatic joint pain formulation.", disease: "Rheumatoid Arthritis" }
    ];

    const seededProducts = [];
    for (const p of productsData) {
      const prod = await Product.findOneAndUpdate(
        { sku: p.sku },
        { ...p, isDeleted: false },
        { upsert: true, new: true }
      );
      seededProducts.push(prod);

      // Create InventoryEntry
      await InventoryEntry.findOneAndUpdate(
        { productId: prod._id, warehouseId: wh._id },
        { warehouseId: wh._id, warehouseName: wh.name, productId: prod._id, productType: prod.name, size: prod.size, colour: prod.colour, shape: prod.shape, weight: prod.weight, hsnCode: prod.hsnCode, qtyBoxes: prod.stockLevel, packing: 1 },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Products & Warehouse Stock seeded');

    // 4. Raw Materials & Batches
    const rmData = [
      { name: "Dry Amla (Amalaki)", sku: "RM-AML-01", category: "Herbs", unit: "kg", minReorder: 25, currentStock: 150 },
      { name: "Ashwagandha Root Powder", sku: "RM-ASH-01", category: "Herbs", unit: "kg", minReorder: 20, currentStock: 80 },
      { name: "Pure Desi Cow Ghee", sku: "RM-GHE-01", category: "Dairy", unit: "kg", minReorder: 10, currentStock: 50 },
      { name: "Haritaki Fruit Powder", sku: "RM-HAR-01", category: "Herbs", unit: "kg", minReorder: 15, currentStock: 100 }
    ];

    const seededRawMaterials = [];
    for (const rm of rmData) {
      const mat = await RawMaterial.findOneAndUpdate(
        { sku: rm.sku },
        { ...rm, stockLevel: rm.currentStock },
        { upsert: true, new: true }
      );
      seededRawMaterials.push(mat);
      await RawMaterialEntry.findOneAndUpdate(
        { rawMaterialId: mat._id, batchNo: `BAT-${rm.sku}-2026` },
        { rawMaterialId: mat._id, batchNo: `BAT-${rm.sku}-2026`, qty: rm.currentStock, purchaseRate: rm.sku.includes('GHE') ? 650 : 180, expiryDate: new Date('2027-12-31'), supplier: "Himalaya Herbal Farms" },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Raw Materials & Batches seeded');

    // 5. Customers & Vendors
    const customersData = [
      {
        name: "Varanasi Ayurvedic Agency",
        company: "Varanasi Ayurvedic Agency",
        gstin: "09AABCV1234A1Z5",
        phone: "9839012345",
        contactPerson: "Rajesh Gupta",
        state: "Uttar Pradesh",
        customerType: "gst",
        recordTracking: "invoice_ledger",
        regularBalance: 45000,
        cashBalance: 0,
        billingAddress: { city: "Varanasi", state: "Uttar Pradesh", street: "Daranagar, Varanasi", pin: "221001" }
      },
      {
        name: "Kashi Medicine Distributors",
        company: "Kashi Medicine Distributors",
        gstin: "09AABCK5678B1Z2",
        phone: "9839099887",
        contactPerson: "Suresh Agarwal",
        state: "Uttar Pradesh",
        customerType: "gst",
        recordTracking: "invoice_ledger",
        regularBalance: 12500,
        cashBalance: 5000,
        billingAddress: { city: "Varanasi", state: "Uttar Pradesh", street: "Lahurabir, Varanasi", pin: "221002" }
      },
      {
        name: "Prayagraj Health Pharmacy",
        company: "Prayagraj Health Pharmacy",
        gstin: "09AABCP9101C1Z9",
        phone: "9415011223",
        contactPerson: "Anil Srivastava",
        state: "Uttar Pradesh",
        customerType: "gst",
        recordTracking: "invoice_ledger",
        regularBalance: 0,
        cashBalance: 0,
        billingAddress: { city: "Prayagraj", state: "Uttar Pradesh", street: "Civil Lines, Prayagraj", pin: "211001" }
      },
      {
        name: "Banaras Local Herb Counter",
        company: "Banaras Local Herb Counter",
        gstin: "",
        phone: "9839044332",
        contactPerson: "Ramesh Sharma",
        state: "Uttar Pradesh",
        customerType: "cash",
        recordTracking: "cash_ledger",
        regularBalance: 0,
        cashBalance: 15000,
        billingAddress: { city: "Varanasi", state: "Uttar Pradesh", street: "Chowk, Varanasi", pin: "221001" }
      }
    ];

    const seededCustomers = [];
    for (const c of customersData) {
      const cust = await Customer.findOneAndUpdate({ name: c.name }, c, { upsert: true, new: true });
      seededCustomers.push(cust);
    }

    const vendorsData = [
      {
        name: "Himalaya Botanical Farms",
        company: "Himalaya Botanical Farms",
        registeredName: "Himalaya Botanical Farms Pvt Ltd",
        gstin: "05AABCH9988D1Z4",
        phone: "9816044332",
        contactPerson: "Dr. H. S. Rawat",
        productCategory: "Herbs & Botanicals",
        addressCity: "Haridwar",
        state: "Uttarakhand",
        regularBalance: 25000
      },
      {
        name: "Banaras Herb Wholesalers",
        company: "Banaras Herb Wholesalers",
        registeredName: "Banaras Herb Wholesalers",
        gstin: "09AABCB3322E1Z7",
        phone: "9450077889",
        contactPerson: "Gopal Das",
        productCategory: "Spices & Extract",
        addressCity: "Varanasi",
        state: "Uttar Pradesh",
        regularBalance: 10000
      }
    ];

    for (const v of vendorsData) {
      await Vendor.findOneAndUpdate({ name: v.name }, v, { upsert: true, new: true });
    }
    console.log('✅ Customers & Vendors seeded');

    // 6. CRM Leads & Pipeline Contacts
    const contactsData = [
      { name: 'Dr. Anand Verma', email: 'anand.verma@ayurclinic.in', phone: '9839011111', company: 'Anand Ayurvedic Chikitsalaya', stage: 'won', dealValue: 85000, owner: adminUser.name },
      { name: 'Banaras Medicine Mart', email: 'orders@banarasmeds.com', phone: '9839022222', company: 'Banaras Medicine Mart', stage: 'proposal', dealValue: 120000, owner: adminUser.name },
      { name: 'Sarnath Pharmacy Store', email: 'contact@sarnathpharmacy.in', phone: '9839033333', company: 'Sarnath Pharmacy Store', stage: 'contacted', dealValue: 45000, owner: adminUser.name },
      { name: 'Gorakhpur Healthcare Agency', email: 'sales@gorakhpurhealth.com', phone: '9839044444', company: 'Gorakhpur Healthcare Agency', stage: 'lead', dealValue: 200000, owner: adminUser.name }
    ];

    for (const cnt of contactsData) {
      await Contact.findOneAndUpdate({ email: cnt.email }, cnt, { upsert: true, new: true });
    }

    await Task.create([
      { title: 'Follow-up call with Banaras Medicine Mart regarding S.B Liv Syrup bulk discount', dueDate: new Date(Date.now() + 86400000), completed: false, assignedTo: adminUser.name },
      { title: 'Dispatch sample boxes of Gasterna to Sarnath Pharmacy', dueDate: new Date(), completed: true, assignedTo: adminUser.name }
    ]);

    await Activity.create([
      { text: 'Finalized GST B2B Invoice SB-2627-0001 for Varanasi Ayurvedic Agency', type: 'system' },
      { text: 'Rahul Verma (MR-001) logged attendance check-in at Chetganj, Varanasi', type: 'call' },
      { text: 'Completed QA Approval for Abhayarishta Batch BATCH-SB-20260720-01', type: 'note' }
    ]);
    console.log('✅ CRM Contacts, Tasks & Activities seeded');

    // 7. Medical Representatives, Attendance Logs & Expenses
    const mr1 = await MedicalRepresentative.findOneAndUpdate(
      { code: 'MR-001' },
      { name: 'Rahul Verma', code: 'MR-001', email: 'rahul.mr@shekharbandhu.com', phone: '9839100001', territory: 'Varanasi Central & East', monthlyTarget: 150000, isActive: true },
      { upsert: true, new: true }
    );

    const mr2 = await MedicalRepresentative.findOneAndUpdate(
      { code: 'MR-002' },
      { name: 'Priya Sharma', code: 'MR-002', email: 'priya.mr@shekharbandhu.com', phone: '9839100002', territory: 'Prayagraj Division', monthlyTarget: 180000, isActive: true },
      { upsert: true, new: true }
    );

    const todayStr = new Date().toISOString().split('T')[0];
    await MrDailyLog.findOneAndUpdate(
      { mrId: mr1._id, date: todayStr },
      {
        mrId: mr1._id,
        date: todayStr,
        checkIn: { time: new Date('2026-07-23T09:15:00Z'), latitude: 25.3176, longitude: 82.9739, location: 'Chetganj, Varanasi' },
        checkOut: { time: new Date('2026-07-23T18:30:00Z'), latitude: 25.3216, longitude: 82.9865, location: 'Sigra, Varanasi' },
        startKmReading: 14200,
        endKmReading: 14268,
        totalDistance: 68,
        status: 'completed'
      },
      { upsert: true, new: true }
    );

    const visit1 = await MrVisit.create({
      mrId: mr1._id,
      doctorName: "Dr. V. K. Tripathi (MD Ayur)",
      clinicName: "Tripathi Ayurvedic Chikitsalaya",
      specialization: "Ayurvedic Physician",
      city: "Varanasi",
      purpose: "sampling",
      orderTaken: true,
      orderAmount: 8500,
      sampleDetails: [
        { productId: seededProducts[0]._id, name: seededProducts[0].name, qty: 5 },
        { productId: seededProducts[2]._id, name: seededProducts[2].name, qty: 10 }
      ],
      latitude: 25.3176,
      longitude: 82.9739,
      feedback: "Interested in stocking S.B Liv Syrup in 200ml bottles.",
      date: new Date()
    });

    await MrExpense.create({
      mrId: mr1._id,
      date: new Date(),
      category: 'travel',
      amount: 450,
      description: 'Fuel expenses for clinic visits in Chetganj & Sigra',
      status: 'approved',
      approvedBy: adminUser._id
    });

    await StockMovement.findOneAndUpdate(
      { docNo: 'DC-SMP-0001' },
      {
        docNo: 'DC-SMP-0001',
        direction: 'out',
        type: 'sample',
        date: new Date(),
        partyType: 'mr',
        partyId: mr1._id,
        partyName: `Dr. V. K. Tripathi (via ${mr1.name})`,
        medicalRepName: mr1.name,
        doctorName: 'Dr. V. K. Tripathi',
        items: [
          { productId: seededProducts[0]._id, productName: seededProducts[0].name, qty: 5, packing: 1, rate: 0, mrp: 120 },
          { productId: seededProducts[2]._id, productName: seededProducts[2].name, qty: 10, packing: 1, rate: 0, mrp: 110 }
        ],
        isFree: true,
        status: 'dispatched',
        sourceDocType: 'MrVisit',
        sourceDocId: visit1._id,
        notes: 'Doctor samples given during field clinic visit'
      },
      { upsert: true, new: true }
    );
    console.log('✅ MRs, Field Visits, Expenses & Sample Challans seeded');

    // 8. Manufacturing Batch & BOM
    // Use correct schema fields: productId (required ObjectId), plannedQty (required)
    // Stage names must match the MANUFACTURING_STAGES enum in the model
    await BatchProduction.findOneAndUpdate(
      { batchNo: 'BATCH-SB-20260720-01' },
      {
        batchNo: 'BATCH-SB-20260720-01',
        productId: seededProducts[0]._id,  // ABHAYARISHTA
        plannedQty: 500,
        actualYieldQty: 500,
        startDate: new Date('2026-07-15'),
        endDate: new Date('2026-07-20'),
        status: 'completed',
        stages: [
          { name: 'Raw Material Verification & Weighing', status: 'completed', startedAt: new Date('2026-07-15T08:00:00Z'), completedAt: new Date('2026-07-15T12:00:00Z'), completedBy: 'Factory Manager', notes: 'All RM weights verified and approved' },
          { name: 'Primary Processing (Swasan/Mardan)', status: 'completed', startedAt: new Date('2026-07-16T08:00:00Z'), completedAt: new Date('2026-07-16T18:00:00Z'), completedBy: 'Factory Worker', notes: 'Crushing & washing completed' },
          { name: 'Mixing & Blending', status: 'completed', startedAt: new Date('2026-07-17T08:00:00Z'), completedAt: new Date('2026-07-18T18:00:00Z'), completedBy: 'Factory Worker', notes: 'Kwath decoction prepared & fermentation initiated' },
          { name: 'Forming (Vati/Gutika)', status: 'skipped', notes: 'Not applicable for liquid arishta formulation' },
          { name: 'Drying', status: 'skipped', notes: 'Not applicable for liquid arishta formulation' },
          { name: 'QC Testing', status: 'completed', startedAt: new Date('2026-07-20T08:00:00Z'), completedAt: new Date('2026-07-20T14:00:00Z'), completedBy: 'QC Lab', notes: 'pH 4.2, alcohol 8.5% v/v — passed all pharmacopoeial specs' },
          { name: 'Packaging & Labeling', status: 'completed', startedAt: new Date('2026-07-20T14:30:00Z'), completedAt: new Date('2026-07-20T18:00:00Z'), completedBy: 'Factory Worker', notes: '500 bottles filled, capped & labeled' }
        ],
        qcNotes: 'pH 4.2, alcohol content 8.5% v/v. Passed all pharmacopoeial specs.',
        qcPassedBy: 'Dr. Shekhar Bandhu (Admin)',
        rawMaterialCost: 12500,
        overheadCost: 2500,
        unitProductionCost: 30,
        wasteQty: 2,
        wasteReason: 'Minor spillage during filtration',
        variancePercent: 0.4,
        packagingDeducted: true
      },
      { upsert: true, new: true }
    );

    await BillOfMaterials.findOneAndUpdate(
      { productId: seededProducts[0]._id },
      {
        productId: seededProducts[0]._id,
        batchYieldSize: 500,
        isActive: true,
        productionNotes: 'Classical Ayurvedic self-fermented arishta preparation',
        overheadCost: 1500,
        ingredients: [
          { rawMaterialId: seededRawMaterials[0]._id, qtyRequired: 50 },
          { rawMaterialId: seededRawMaterials[2]._id, qtyRequired: 30 }
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✅ Manufacturing Batch & BOM Recipe seeded');

    // 9. Quotation, Invoices, Payments, Credit Notes & Delivery Challans
    await Quotation.findOneAndUpdate(
      { quotationNo: 'QT-2627-0001' },
      {
        quotationNo: 'QT-2627-0001',
        customerName: seededCustomers[1].name,
        customerAddress: seededCustomers[1].address,
        date: new Date(),
        validUntil: new Date(Date.now() + 15 * 86400000),
        items: [
          { productId: seededProducts[5]._id, productName: seededProducts[5].name, hsnCode: '30049011', qty: 100, rate: 110, amount: 11000, gstRate: 12, cgst: 660, sgst: 660 }
        ],
        subtotal: 11000,
        cgst: 660,
        sgst: 660,
        totalAmount: 12320,
        status: 'sent'
      },
      { upsert: true, new: true }
    );

    const inv1 = await Invoice.findOneAndUpdate(
      { invoiceNo: 'SB-2627-0001' },
      {
        invoiceNo: 'SB-2627-0001',
        customerName: seededCustomers[0].name,
        customerGstin: seededCustomers[0].gstin,
        customerAddress: seededCustomers[0].address,
        date: new Date('2026-07-10'),
        dueDate: new Date('2026-08-10'),
        mode: 'regular',
        items: [
          { productId: seededProducts[0]._id, productName: seededProducts[0].name, hsnCode: '30049011', qty: 50, rate: 120, amount: 6000, gstRate: 12, cgst: 360, sgst: 360 }
        ],
        subtotal: 6000,
        cgst: 360,
        sgst: 360,
        igst: 0,
        amount: 6720,
        status: 'paid',
        isFinalized: true
      },
      { upsert: true, new: true }
    );

    await Payment.findOneAndUpdate(
      { referenceNo: 'UPI9988771122' },
      {
        type: 'receive',
        partyType: 'Customer',
        partyId: seededCustomers[0]._id,
        partyName: seededCustomers[0].name,
        amount: 6720,
        mode: 'regular',
        paymentMethod: 'UPI',
        referenceNo: 'UPI9988771122',
        date: new Date('2026-07-12'),
        notes: 'Full payment received against SB-2627-0001 via Google Pay'
      },
      { upsert: true, new: true }
    );

    await CreditNote.findOneAndUpdate(
      { noteNo: 'CN-2627-0001' },
      {
        noteNo: 'CN-2627-0001',
        type: 'credit',
        originalInvoiceNo: 'SB-2627-0001',
        originalInvoiceDate: new Date('2026-07-10'),
        partyName: seededCustomers[0].name,
        partyGstin: seededCustomers[0].gstin,
        reason: 'Sales Return — 2 damaged bottles',
        table9BType: 'B2B',
        items: [
          { productName: seededProducts[0].name, qty: 2, rate: 120, amount: 240, gstRate: 12, cgst: 14.4, sgst: 14.4 }
        ],
        subtotal: 240,
        totalGst: 28.8,
        totalAmount: 268.8,
        status: 'active',
        date: new Date('2026-07-14')
      },
      { upsert: true, new: true }
    );

    await Challan.findOneAndUpdate(
      { challanNo: 'DC-2627-0001' },
      {
        challanNo: 'DC-2627-0001',
        invoiceNo: 'SB-2627-0001',
        customerName: seededCustomers[0].name,
        address: seededCustomers[0].address,
        date: new Date('2026-07-11'),
        transporterName: 'Varanasi Local Transport Co.',
        vehicleNo: 'UP 65 BT 1234',
        items: [
          { productName: seededProducts[0].name, qty: 50, packing: 10 }
        ],
        status: 'dispatched'
      },
      { upsert: true, new: true }
    );

    await Dispatch.findOneAndUpdate(
      { dispatchNo: 'DISP-2627-0001' },
      {
        dispatchNo: 'DISP-2627-0001',
        invoiceNo: 'SB-2627-0001',
        customerName: seededCustomers[0].name,
        transporterName: 'Varanasi Express Freight',
        trackingId: 'TRK-VNS-998811',
        date: new Date(),
        status: 'in_transit'
      },
      { upsert: true, new: true }
    );

    await Complaint.findOneAndUpdate(
      { complaintNo: 'CMP-2026-001' },
      {
        complaintNo: 'CMP-2026-001',
        customerName: seededCustomers[0].name,
        partyName: seededCustomers[0].name,
        issueType: 'Packaging Damage',
        description: 'Outer carton box had minor wet stain during transport.',
        status: 'resolved',
        resolution: 'Replaced 2 damaged bottles via Credit Note CN-2627-0001.'
      },
      { upsert: true, new: true }
    );

    await Campaign.findOneAndUpdate(
      { name: 'Ayurvedic Monsoon Health Fest 2026' },
      {
        name: 'Ayurvedic Monsoon Health Fest 2026',
        platform: 'whatsapp',
        targetAudience: 'Distributors & Doctors',
        status: 'running',
        budget: 15000,
        spent: 4500
      },
      { upsert: true, new: true }
    );

    await SalesTarget.findOneAndUpdate(
      { agentId: adminUser._id, month: 7, year: 2026 },
      {
        agentId: adminUser._id,
        agentName: adminUser.name,
        month: 7,
        year: 2026,
        targetAmount: 500000,
        notes: 'Monthly sales target for Q2-2026'
      },
      { upsert: true, new: true }
    );

    console.log('✅ Quotations, Invoices, Payments, Dispatches, Complaints, Campaigns & Targets seeded');
    console.log('🎉🎉 Complete 360° Shekhar Bandhu CRM Demo Seeding Finished Successfully!');

  } catch (err) {
    console.error('❌ Full Demo Seeding Error:', err);
  }
}

// Execute if run directly
if (require.main === module) {
  const MONGO_URI = config.mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shekhar-bandhu-crm';
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('🔌 Connected to MongoDB');
      await seedCompleteDemoData();
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedCompleteDemoData };
