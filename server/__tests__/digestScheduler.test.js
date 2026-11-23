const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Firm = require('../models/Firm');
const UserFirm = require('../models/UserFirm');
const { sendDailyDigest } = require('../utils/digestScheduler');
const { sendWhatsAppNotification } = require('../utils/whatsappService');

jest.mock('../utils/whatsappService', () => ({
  sendWhatsAppNotification: jest.fn().mockResolvedValue({ success: true, messageId: 'MSG-MOCK-123' })
}));

let mongoServer;

describe('Task 1 — Daily Executive Digest Scheduler Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Invoice.deleteMany({});
    await Order.deleteMany({});
    await Product.deleteMany({});
    await UserFirm.deleteMany({});
    await Firm.deleteMany({});
    jest.clearAllMocks();
  });

  it('fetches admin/owner users with phone and dispatches formatted WhatsApp digest', async () => {
    // Each digest is dispatched per active firm using active firm memberships.
    const firm = await Firm.create({ name: 'Digest Test Firm' });

    // 1. Seed admin user with phone number
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@shekharbandhu.com',
      password: 'Password123!',
      role: 'admin',
      firmId: firm._id,
      phone: '+919876543210'
    });
    await UserFirm.create({ userId: adminUser._id, firmId: firm._id, role: 'admin', active: true });

    // Seed agent user (should NOT receive digest)
    await User.create({
      name: 'Agent User',
      email: 'agent@shekharbandhu.com',
      password: 'Password123!',
      role: 'agent',
      phone: '+919999999999'
    });

    // 2. Seed invoice & order data
    await Invoice.create({
      invoiceNo: 'VP/26-27/101',
      type: 'sale',
      isFinalized: true,
      amount: 15000,
      nettTotal: 15000,
      customerName: 'Test Ayurveda Pharmacy',
      firmId: firm._id,
      date: new Date()
    });

    await Order.create({
      name: 'Test Customer',
      email: 'test@pharmacy.com',
      phone: '+919876543210',
      shippingAddress: 'Varanasi, UP',
      totalAmount: 5000,
      firmId: firm._id,
      status: 'pending'
    });

    await Product.create({
      name: 'Ashwagandha Churna',
      sku: 'ASH-001',
      stockLevel: 5,
      firmId: firm._id,
      mrp: 200,
      rate: 150
    });

    // 3. Trigger sendDailyDigest()
    const results = await sendDailyDigest();
    expect(results).toHaveLength(1);
    const result = results[0];

    expect(result.sentCount).toBe(1);
    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppNotification).toHaveBeenCalledWith('+919876543210', expect.stringContaining('Daily Executive Sales Digest'));
    expect(result.digestText).toContain('Total Sales Revenue Today');
    expect(result.digestText).toContain('15,000');
  });
});
