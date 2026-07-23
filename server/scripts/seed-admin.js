require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env');
  process.exit(1);
}

async function seedAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const email = 'admin@shekharbandhu.com';
    const password = 'admin123';

    let user = await User.findOne({ email });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user) {
      user.password = hashedPassword;
      user.role = 'admin';
      user.canAccessCash = true;
      user.mustChangePassword = false;
      await user.save();
      console.log(`✅ Updated existing admin user: ${email}`);
    } else {
      await User.create({
        name: 'Admin User',
        email,
        password: hashedPassword,
        role: 'admin',
        canAccessCash: true,
        mustChangePassword: false,
      });
      console.log(`👤 Created new admin user: ${email}`);
    }

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
