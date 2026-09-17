const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');

// Seed database on first run
async function seedDatabase() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Production seeding is disabled. Create/bootstrap users through a controlled administrative process.');
  }

  const userCount = await User.countDocuments();
  if (isProduction && userCount > 0) {
    throw new Error('Production seed is only allowed for an empty environment; existing users were detected.');
  }
  if (userCount === 0) {
    console.log('👤 Seeding database with initial users...');
    const adminEmail = process.env.SEED_ADMIN_EMAIL || (process.env.NODE_ENV === 'production' ? '' : 'admin@shekharbandhu.com');
    const adminPasswordRaw = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
    if (!adminEmail || !adminPasswordRaw || adminPasswordRaw.length < 12) {
      throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (minimum 12 characters) are required for production seeding');
    }
    const salt = await bcrypt.genSalt(12);
    const adminPassword = await bcrypt.hash(adminPasswordRaw, salt);

    const users = [
      { name: 'Admin User', email: adminEmail.toLowerCase(), password: adminPassword, role: 'admin', canAccessCash: true, mustChangePassword: true }
    ];
    if (process.env.NODE_ENV !== 'production') {
      users.push(
        { name: 'Manager User', email: 'manager@shekharbandhu.com', password: await bcrypt.hash('manager123', salt), role: 'manager', mustChangePassword: true },
        { name: 'Agent User', email: 'agent@shekharbandhu.com', password: await bcrypt.hash('agent123', salt), role: 'agent', mustChangePassword: true }
      );
    }
    const createdUsers = await User.insertMany(users);
    if (process.env.NODE_ENV === 'production') {
      const Firm = require('../models/Firm');
      const UserFirm = require('../models/UserFirm');
      const firm = await Firm.create({ name: process.env.SEED_FIRM_NAME || 'Shekhar Bandhu Aushadhalaya' });
      await UserFirm.create({ userId: createdUsers[0]._id, firmId: firm._id, role: 'admin', isDefault: true, active: true });
    }
    console.log('👤 Users seeded successfully');
  }

  console.log('✅ Database seeded successfully');

  console.log('✅ Database seeded successfully');
}

module.exports = { seedDatabase };
