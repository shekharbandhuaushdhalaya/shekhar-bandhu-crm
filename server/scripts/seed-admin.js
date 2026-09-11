require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Firm = require('../models/Firm');
const UserFirm = require('../models/UserFirm');

const MONGODB_URI = process.env.MONGODB_URI;
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
const firmName = process.env.BOOTSTRAP_FIRM_NAME || 'Shekhar Bandhu Aushadhalaya';

if (!MONGODB_URI) throw new Error('MONGODB_URI is required');
if (!email || !password || password.length < 12) throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (minimum 12 characters) are required');
if (process.env.NODE_ENV === 'production' && process.env.BOOTSTRAP_ADMIN_CONFIRM !== 'YES') {
  throw new Error('Production bootstrap requires BOOTSTRAP_ADMIN_CONFIRM=YES');
}

(async () => {
  await mongoose.connect(MONGODB_URI);
  try {
    let user = await User.findOne({ email });
    if (!user) {
      const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(12));
      user = await User.create({ name: 'Admin User', email, password: hashedPassword, role: 'admin', canAccessCash: true, mustChangePassword: true });
      console.log(`Created admin user: ${email}`);
    } else {
      console.log(`Admin user already exists: ${email}; password was NOT changed.`);
    }

    let firm = await Firm.findOne().sort({ createdAt: 1 });
    if (!firm) firm = await Firm.create({ name: firmName });
    const membership = await UserFirm.findOne({ userId: user._id, firmId: firm._id });
    if (!membership) await UserFirm.create({ userId: user._id, firmId: firm._id, role: 'admin', isDefault: true, active: true });
    console.log(`Admin is provisioned for firm: ${firm.name}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch(err => { console.error('Bootstrap failed:', err.message); process.exit(1); });
