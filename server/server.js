require('dotenv').config();
const config = require('./src/config');

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const compression = require('compression');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { trackAgentActivity } = require('./utils/agentTracker');

// ─── Route imports (grouped by domain) ───
const { router: authRoutes } = require('./routes/auth/auth');
const mfaRoutes = require('./routes/auth/mfa');
const systemRoutes = require('./routes/system/system');
const rbacRoutes = require('./routes/system/rbac');
const traceRoutes = require('./routes/system/trace');
const queryRoutes = require('./routes/system/queries');

const contactRoutes = require('./routes/crm/contacts');
const doctorRoutes = require('./routes/crm/doctors');
const taskRoutes = require('./routes/crm/tasks');
const medicalRepRoutes = require('./routes/crm/medicalReps');

const campaignRoutes = require('./routes/marketing/campaigns');
const socialRoutes = require('./routes/marketing/social');

const customerRoutes = require('./routes/sales/customers');
const customerPricingRoutes = require('./routes/sales/customerPricing');
const vendorRoutes = require('./routes/sales/vendors');
const quotationRoutes = require('./routes/sales/quotations');
const invoiceRoutes = require('./routes/sales/invoices');
const challanRoutes = require('./routes/sales/challans');
const orderRoutes = require('./routes/sales/orders');
const salesTargetRoutes = require('./routes/sales/salesTargets');
const partiesRoutes = require('./routes/sales/parties');

const productRoutes = require('./routes/inventory/products');
const inventoryRoutes = require('./routes/inventory/inventories');
const warehouseRoutes = require('./routes/inventory/warehouses');
const inventoryEntryRoutes = require('./routes/inventory/inventory-entries');
const complianceRoutes = require('./routes/inventory/compliance');
const stockTransferRoutes = require('./routes/inventory/transfers');
const notificationRoutes = require('./routes/system/notifications');

const rawMaterialRoutes = require('./routes/manufacturing/rawMaterials');
const bomRoutes = require('./routes/manufacturing/bom');
const batchProductionRoutes = require('./routes/manufacturing/batchProductions');
const manufacturingUnitRoutes = require('./routes/manufacturing/manufacturingUnits');

const paymentRoutes = require('./routes/finance/payments');
const paymentGatewayRoutes = require('./routes/finance/paymentGateway');
const creditNoteRoutes = require('./routes/finance/creditNotes');
const gstReturnRoutes = require('./routes/finance/gstReturns');
const tallyRoutes = require('./routes/finance/tally');

const dispatchRoutes = require('./routes/operations/dispatches');
const complaintRoutes = require('./routes/operations/complaints');
const sampleRoutes = require('./routes/operations/samples');
const stockMovementRoutes = require('./routes/operations/stockMovements');

const analyticsRoutes = require('./routes/analytics/analytics');
const dashboardRoutes = require('./routes/analytics/dashboard');

const publicProductRoutes = require('./routes/public/products');
const publicOrderRoutes = require('./routes/public/orders');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  },
});

const PORT = config.port;
const MONGODB_URI = config.mongoUri;
const JWT_SECRET = config.jwtSecret;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Please set it in .env');
  process.exit(1);
}

// Socket.io Handshake JWT Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error('Unauthorized: No authentication token provided'));
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return next(new Error('Unauthorized: Invalid or expired token'));
    }
    socket.user = user;
    next();
  });
});

// Attach socket.io instance to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});

io.on('connection', (socket) => {
  console.log('⚡ Authenticated client connected via WebSocket:', socket.id, `(User: ${socket.user?.name || socket.user?.id})`);
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

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
    trackAgentActivity(user.id, req);
    next();
  });
}

// Middleware
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(morgan('short'));

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// Rate limit: 100 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ─── Public routes (no auth) ───
app.use('/api/public/products', publicProductRoutes);
app.use('/api/public/queries', queryRoutes);
app.use('/api/public/orders', publicOrderRoutes);
app.use('/api/orders', publicOrderRoutes); // also at /api/orders/public/* for website compat

// Rate limiter for auth routes (stricter: 20 req/min)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ─── Try MongoDB connection & start server ───

// Register all routes synchronously
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/mfa', authLimiter, mfaRoutes);
app.use('/api/system', systemRoutes);

app.use('/api/contacts', authenticateJWT, contactRoutes);
app.use('/api/doctors', authenticateJWT, doctorRoutes);
app.use('/api/tasks', authenticateJWT, taskRoutes);
app.use('/api/dashboard', authenticateJWT, dashboardRoutes);
app.use('/api/customers', authenticateJWT, customerRoutes);
app.use('/api/customer-pricing', authenticateJWT, customerPricingRoutes);
app.use('/api/vendors', authenticateJWT, vendorRoutes);
app.use('/api/products', authenticateJWT, productRoutes);
app.use('/api/challans', authenticateJWT, challanRoutes);
app.use('/api/inventories', authenticateJWT, inventoryRoutes);
app.use('/api/invoices', authenticateJWT, invoiceRoutes);
app.use('/api/quotations', authenticateJWT, quotationRoutes);
app.use('/api/warehouses', authenticateJWT, warehouseRoutes);
app.use('/api/inventory-entries', authenticateJWT, inventoryEntryRoutes);
app.use('/api/inventory/compliance', authenticateJWT, complianceRoutes);
app.use('/api/inventory/transfers', authenticateJWT, stockTransferRoutes);
app.use('/api/notifications', authenticateJWT, notificationRoutes);
app.use('/api/payments', authenticateJWT, paymentRoutes);
app.use('/api/analytics', authenticateJWT, analyticsRoutes);
app.use('/api/queries', authenticateJWT, queryRoutes);
app.use('/api/orders', authenticateJWT, orderRoutes);
app.use('/api/raw-materials', authenticateJWT, rawMaterialRoutes);
app.use('/api/bom', authenticateJWT, bomRoutes);
app.use('/api/batch-productions', authenticateJWT, batchProductionRoutes);
app.use('/api/manufacturing-units', authenticateJWT, manufacturingUnitRoutes);
app.use('/api/complaints', authenticateJWT, complaintRoutes);
app.use('/api/samples', authenticateJWT, sampleRoutes);
app.use('/api/stock-movements', authenticateJWT, stockMovementRoutes);
app.use('/api/sales-targets', authenticateJWT, salesTargetRoutes);
app.use('/api/dispatches', authenticateJWT, dispatchRoutes);
app.use('/api/parties', authenticateJWT, partiesRoutes);
app.use('/api/trace', authenticateJWT, traceRoutes);
app.use('/api/payments/gateway', authenticateJWT, paymentGatewayRoutes);
app.use('/api/payments/gateway/webhook', paymentGatewayRoutes);
app.use('/api/rbac', authenticateJWT, rbacRoutes);
app.use('/api/medical-reps', authenticateJWT, medicalRepRoutes);
app.use('/api/campaigns', authenticateJWT, campaignRoutes);
app.use('/api/social', (req, res, next) => {
  if (req.path === '/callback' || req.path === '/auth-url') {
    return next();
  }
  return authenticateJWT(req, res, next);
}, socialRoutes);
const purchaseOrderRoutes = require('./routes/procurement/purchaseOrders');
app.use('/api/purchase-orders', authenticateJWT, purchaseOrderRoutes);
const equipmentRoutes = require('./routes/manufacturing/equipment');
const deviationRoutes = require('./routes/manufacturing/deviations');
const retentionSampleRoutes = require('./routes/manufacturing/retentionSamples');
const stabilityStudyRoutes = require('./routes/manufacturing/stabilityStudies');
const qualityAuditRoutes = require('./routes/manufacturing/qualityAudits');
const pharmacopoeiaRoutes = require('./routes/manufacturing/pharmacopoeia');
app.use('/api/manufacturing/equipment', authenticateJWT, equipmentRoutes);
app.use('/api/manufacturing/deviations', authenticateJWT, deviationRoutes);
app.use('/api/retention-samples', authenticateJWT, retentionSampleRoutes);
app.use('/api/stability-studies', authenticateJWT, stabilityStudyRoutes);
app.use('/api/manufacturing/quality-audits', authenticateJWT, qualityAuditRoutes);
app.use('/api/pharmacopoeia', authenticateJWT, pharmacopoeiaRoutes);
const batchTraceRoutes = require('./routes/manufacturing/batchTrace');
app.use('/api/manufacturing/batch-trace', authenticateJWT, batchTraceRoutes);
const coaRoutes = require('./routes/manufacturing/coa');
const quarantineRoutes = require('./routes/manufacturing/quarantine');
app.use('/api/manufacturing/coa', authenticateJWT, coaRoutes);
app.use('/api/manufacturing/quarantine', authenticateJWT, quarantineRoutes);
const debitNoteRoutes = require('./routes/finance/debitNotes');
const recurringInvoiceRoutes = require('./routes/sales/recurringInvoices');
const recallRoutes = require('./routes/manufacturing/recalls');
const stocktakeRoutes = require('./routes/inventory/stocktakes');
const leadRoutes = require('./routes/crm/leads');
const vendorQualificationRoutes = require('./routes/manufacturing/vendorQualifications');
const productionPlanRoutes = require('./routes/manufacturing/productionPlans');
const generalExpenseRoutes = require('./routes/finance/generalExpenses');
const mrIncentiveRoutes = require('./routes/crm/mrIncentives');
const financialReportRoutes = require('./routes/finance/financialReports');
const drugLicenseRoutes = require('./routes/manufacturing/drugLicenses');
const bankReconciliationRoutes = require('./routes/finance/bankReconciliations');
const demandForecastingRoutes = require('./routes/analytics/demandForecasting');
const dripCampaignRoutes = require('./routes/marketing/dripCampaigns');
const reportDigestRoutes = require('./routes/analytics/reportDigests');
const sampleConversionRoutes = require('./routes/crm/sampleConversions');
const loyaltySchemeRoutes = require('./routes/sales/loyaltySchemes');
const customReportRoutes = require('./routes/analytics/customReports');
const swaggerDocRoutes = require('./routes/system/swaggerDoc');
const whatsappCampaignRoutes = require('./routes/marketing/whatsappCampaigns');
const courierTrackingRoutes = require('./routes/operations/courierTracking');
const ewayBillRoutes = require('./routes/finance/ewayBills');
const tallySyncRoutes = require('./routes/finance/tallySync');
app.use('/api/credit-notes', authenticateJWT, creditNoteRoutes);
app.use('/api/debit-notes', authenticateJWT, debitNoteRoutes);
app.use('/api/recurring-invoices', authenticateJWT, recurringInvoiceRoutes);
app.use('/api/recalls', authenticateJWT, recallRoutes);
app.use('/api/stocktakes', authenticateJWT, stocktakeRoutes);
app.use('/api/leads', authenticateJWT, leadRoutes);
app.use('/api/vendor-qualifications', authenticateJWT, vendorQualificationRoutes);
app.use('/api/production-plans', authenticateJWT, productionPlanRoutes);
app.use('/api/general-expenses', authenticateJWT, generalExpenseRoutes);
app.use('/api/mr-incentives', authenticateJWT, mrIncentiveRoutes);
app.use('/api/finance/reports', authenticateJWT, financialReportRoutes);
app.use('/api/drug-licenses', authenticateJWT, drugLicenseRoutes);
app.use('/api/bank-reconciliations', authenticateJWT, bankReconciliationRoutes);
app.use('/api/analytics/demand-forecasting', authenticateJWT, demandForecastingRoutes);
app.use('/api/drip-campaigns', authenticateJWT, dripCampaignRoutes);
app.use('/api/analytics/digests', authenticateJWT, reportDigestRoutes);
app.use('/api/sample-conversions', authenticateJWT, sampleConversionRoutes);
app.use('/api/loyalty-schemes', authenticateJWT, loyaltySchemeRoutes);
app.use('/api/analytics/custom-reports', authenticateJWT, customReportRoutes);
app.use('/api/whatsapp-campaigns', authenticateJWT, whatsappCampaignRoutes);
app.use('/api/logistics', courierTrackingRoutes);
app.use('/api/eway-bills', authenticateJWT, ewayBillRoutes);
app.use('/api/tally', authenticateJWT, tallySyncRoutes);
app.use('/api/docs', swaggerDocRoutes);
app.use('/api/gst', authenticateJWT, gstReturnRoutes);
const tdsTcsRoutes = require('./routes/finance/tdsTcs');
app.use('/api/finance', authenticateJWT, tdsTcsRoutes);
app.use('/api/finance/export/tally', authenticateJWT, tallyRoutes);

const portalAuthRoutes = require('./routes/public/portalAuth');
const portalRoutes = require('./routes/portal/portal');
app.use('/api/portal/auth', portalAuthRoutes);
app.use('/api/portal', portalRoutes);

// Global error handler (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Start Express / Socket.IO server immediately
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Shekhar Bandhu CRM Server running on port ${PORT} with WebSockets enabled (bound to 0.0.0.0)`);
  const { startOverdueTaskChecker } = require('./utils/taskOverdueChecker');
  startOverdueTaskChecker(io);
});

// Define startup migrations helper
async function runStartupMigrations() {
  // Drop old unique products index if it exists before seeding duplicate specs
  try {
    const Product = require('./models/Product');
    await Product.collection.dropIndex('productType_1_size_1_colour_1_shape_1_weight_1');
    console.log('✅ Dropped unique product characteristics index');
  } catch (_) {
    // intentionally ignored — index may not exist
  }

  // await seedDatabase();
  await require('./models/RolePermission').seedDefaults();
  console.log('✅ Role permissions seeded');

  try {
    const InventoryEntry = require('./models/InventoryEntry');
    await InventoryEntry.collection.dropIndex('warehouseId_1_productId_1_packing_1');
    console.log('✅ Dropped old inventory index — new vendorId-aware index will be created');
  } catch (_) {
    // intentionally ignored — index may not exist
  }
  try {
    const InventoryEntry = require('./models/InventoryEntry');
    await InventoryEntry.collection.dropIndex('warehouseId_1_productId_1_vendorId_1_packing_1');
    console.log('✅ Dropped 4-field inventory index — new batchNo-aware index will be created');
  } catch (_) {
    // intentionally ignored — index may not exist
  }
  try {
    const Payment = require('./models/Payment');
    await Payment.collection.dropIndex('paymentNo_1');
    console.log('✅ Dropped old paymentNo index from payments collection');
  } catch (_) {
    // intentionally ignored — index may not exist
  }
  await require('./models/InventoryEntry').syncIndexes();
  console.log('✅ Using MongoDB for data');

  try {
    const pharmacopoeiaRoutes = require('./routes/manufacturing/pharmacopoeia');
    if (pharmacopoeiaRoutes.ensureSeedSynced) {
      await pharmacopoeiaRoutes.ensureSeedSynced();
      console.log('✅ Pharmacopoeia seed dataset verified and synced');
    }
    if (pharmacopoeiaRoutes.checkDuplicatePharmacopoeiaEntries) {
      await pharmacopoeiaRoutes.checkDuplicatePharmacopoeiaEntries();
    }
  } catch (pharmErr) {
    console.error('❌ Error during pharmacopoeia startup sync:', pharmErr.message);
  }
}

// Connect to MongoDB asynchronously
mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('🔌 Connected to MongoDB');
    const { startOverdueTaskChecker } = require('./utils/taskOverdueChecker');
    startOverdueTaskChecker();
    const { checkExpiriesAndReorders } = require('./utils/expiryAlertChecker');
    checkExpiriesAndReorders();
    setInterval(() => checkExpiriesAndReorders(), 6 * 60 * 60 * 1000);

    const cron = require('node-cron');
    const { sendDailyDigest, sendDoctorGreetings } = require('./utils/digestScheduler');
    const digestSendHour = process.env.DIGEST_SEND_HOUR || 8;
    cron.schedule(`0 ${digestSendHour} * * *`, () => {
      sendDailyDigest().catch(err => console.error('❌ Daily Executive Digest Cron Error:', err.message));
      sendDoctorGreetings().catch(err => console.error('❌ Daily Doctor Greetings Cron Error:', err.message));
    });
    // Run startup migrations asynchronously out of the request path
    runStartupMigrations().catch(err => {
      console.error('❌ Failed running startup migrations:', err.message);
    });
  })
  .catch(err => {
    console.error('❌ Error: MongoDB connection failed!');
    console.error(err.message);
  });

// ─── Process-level error handling ───
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});