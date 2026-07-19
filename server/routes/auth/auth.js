const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Otp = require('../../models/Otp');
const { trackAgentActivity } = require('../../utils/agentTracker');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();
const config = require('../../src/config');
const JWT_SECRET = config.jwtSecret;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Please set it in .env');
}

// Middleware to extract user from token (local check)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    // Track agent activity asynchronously
    trackAgentActivity(decoded.id, req);
    next();
  });
};

// POST /api/auth/register — Create a user (Admin/system route)
router.post('/register', validate(schemas.userSchema), async (req, res) => {
  try {
    const { name, email, password, role, canAccessCash } = req.body;
    
    // Check if user already exists
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Default canAccessCash to true for admins, otherwise false or request parameter
    const defaultCanAccessCash = role === 'admin' ? true : (canAccessCash || false);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'agent',
      canAccessCash: defaultCanAccessCash,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user._id, name: user.name, email: user.email, role: user.role, canAccessCash: user.canAccessCash }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login — Authenticate user
router.post('/login', validate(schemas.loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).lean();
    if (!user) {
      const { logAction } = require('../../utils/auditLogger');
      await logAction({
        userEmail: email,
        action: 'LOGIN_FAILED',
        description: `Failed login attempt for unregistered email: ${email}`,
        req
      });
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const { logAction } = require('../../utils/auditLogger');
      await logAction({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        description: `Failed login attempt (incorrect password) for email: ${email}`,
        req
      });
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword }
    });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'LOGIN_SUCCESS',
      description: `User logged in successfully: ${user.name} (${user.email})`,
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — Verify token and get profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users — List all users (requires user:view)
router.get('/users', authenticateToken, authorize('user:view'), async (req, res) => {
  try {
    const users = await User.find({}).select('-password').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/users/:id — Update a user's role and cash access
router.put('/users/:id', authenticateToken, authorize('user:edit'), validate(schemas.userSchema.partial()), async (req, res) => {
  try {
    const { role, canAccessCash } = req.body;
    const updateFields = {};
    if (role !== undefined) updateFields.role = role;
    if (canAccessCash !== undefined) updateFields.canAccessCash = canAccessCash;

    const user = await User.findByIdAndUpdate(req.params.id, updateFields, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id — Delete a user
router.delete('/users/:id', authenticateToken, authorize('user:delete'), async (req, res) => {
  try {
    
    // Prevent admin from deleting their own account
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ message: 'User deleted successfully', userId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/whatsapp/send-otp — Generate and send OTP via WhatsApp (Mocked)
router.post('/whatsapp/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Normalize phone number (keep only digits and + symbol)
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    // Generate random 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in OTP database (expires in 5 minutes)
    await Otp.findOneAndUpdate(
      { phone: cleanPhone },
      { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      { upsert: true, new: true }
    );

    // Print OTP code prominently to the server logs
    console.log('\n==================================================');
    console.log('[WHATSAPP OTP SIMULATOR]');
    console.log(`To: ${cleanPhone}`);
    console.log(`Message: Your Shekhar Bandhu Aushadhalaya verification code is: ${code}`);
    console.log('==================================================\n');

    // Return the code in response for testing/development simplicity
    res.status(200).json({ 
      message: 'Verification code sent to WhatsApp',
      devOtp: code 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/whatsapp/verify-otp — Verify WhatsApp OTP code
router.post('/whatsapp/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone number and verification code are required' });
    }

    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    const cleanCode = code.trim();

    // Query OTP record from DB
    const record = await Otp.findOne({ phone: cleanPhone });
    if (!record) {
      return res.status(400).json({ error: 'Code expired or never requested. Please try again.' });
    }

    // Verify expiration time (as fallback)
    if (record.expiresAt < new Date()) {
      await Otp.deleteOne({ phone: cleanPhone });
      return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    }

    // Verify matching code
    if (record.code !== cleanCode) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // OTP verified successfully — delete it so it cannot be reused
    await Otp.deleteOne({ phone: cleanPhone });

    // Fetch user details from existing orders to return customerName
    const Order = require('../../models/Order');
    const lastOrder = await Order.findOne({ phone: cleanPhone }).sort({ createdAt: -1 }).lean();
    const customerName = lastOrder ? lastOrder.name : 'Valued Customer';

    res.status(200).json({
      success: true,
      phone: cleanPhone,
      customerName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/update-profile — Update own profile details (Authenticated)
router.put('/update-profile', authenticateToken, validate(schemas.updateProfileSchema), async (req, res) => {
  try {
    const { name, email } = req.body;
    const updateFields = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (email !== undefined) {
      const emailLower = email.trim().toLowerCase();
      // Check if email already exists for another user
      const existing = await User.findOne({ email: emailLower, _id: { $ne: req.user.id } }).lean();
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updateFields.email = emailLower;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateFields, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'UPDATE_PROFILE',
      description: `User updated profile settings: ${user.name} (${user.email})`,
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/change-password — Update own password (Authenticated)
router.put('/change-password', authenticateToken, validate(schemas.changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid current password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CHANGE_PASSWORD',
      description: `User changed password: ${user.name} (${user.email})`,
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  authenticateToken
};
