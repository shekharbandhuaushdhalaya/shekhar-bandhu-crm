const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Firm = require('../../models/Firm');
const UserFirm = require('../../models/UserFirm');
const RefreshSession = require('../../models/RefreshSession');
const Otp = require('../../models/Otp');
const { trackAgentActivity } = require('../../utils/agentTracker');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { authenticateJWT } = require('../../middleware/authenticateJWT');
const { sendWhatsAppNotification } = require('../../utils/whatsappService');

const router = express.Router();
const config = require('../../src/config');
const JWT_SECRET = config.jwtSecret;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Please set it in .env');
}

function hashRefreshToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function issueRefreshToken({ userId, firmId, req }) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86400000);
  return RefreshSession.create({ userId, firmId: firmId || null, tokenHash: hashRefreshToken(raw), sessionId, expiresAt, userAgent: req.headers['user-agent'] || '', ipAddress: req.ip || '' }).then(() => raw);
}
function issueAccessToken(user, firmId, firmRole) {
  return jwt.sign({ id: user._id, name: user.name, email: user.email, role: firmRole || user.role, firmRole: firmRole || user.role, firmId: firmId || null, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword }, JWT_SECRET, { expiresIn: config.accessTokenTtl });
}

const authenticateToken = authenticateJWT;

// POST /api/auth/register — Create a user (Admin/system route with bootstrap protection)
router.post('/register', validate(schemas.userSchema), async (req, res) => {
  try {
    const adminExists = await User.exists({ role: 'admin' });
    if (!adminExists && config.isProduction) {
      return res.status(403).json({
        error: 'Public first-admin registration is disabled in production. Use npm run bootstrap:admin with BOOTSTRAP_ADMIN_CONFIRM=YES.',
        code: 'PRODUCTION_BOOTSTRAP_REQUIRED'
      });
    }
    
    if (adminExists) {
      // Authenticate token manually
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Authentication required. Admin registration is locked.' });
      }
      
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      
      if (!decoded.id || !decoded.firmId) {
        return res.status(403).json({ error: 'A current firm-scoped staff session is required to create users.' });
      }
      const [actor, membership] = await Promise.all([
        User.findById(decoded.id).select('_id name email').lean(),
        UserFirm.findOne({ userId: decoded.id, firmId: decoded.firmId, active: true }).lean(),
      ]);
      if (!actor || !membership) {
        return res.status(403).json({ error: 'Your firm membership is no longer active.' });
      }
      req.user = { ...decoded, firmId: String(membership.firmId), firmRole: membership.role, role: membership.role };
      trackAgentActivity(decoded.id, req);

      // Check permissions against the actor's current firm membership, never a stale JWT role.
      const { getRolePermissions } = require('../../middleware/authorize');
      const rolePermissions = await getRolePermissions(membership.role, membership.firmId);
      const { hasPermission } = require('../../utils/permissions');
      if (!hasPermission(rolePermissions, 'user:create')) {
        return res.status(403).json({ error: 'Access denied. Required permission: user:create' });
      }
    }

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

    const user = await User.create({ name, email, password: hashedPassword, role: role || 'agent', canAccessCash: defaultCanAccessCash });
    if (req.user?.firmId) {
      await UserFirm.create({ userId: user._id, firmId: req.user.firmId, role: role || 'agent', isDefault: true });
    }

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

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(429).json({ error: 'Account temporarily locked after repeated failed logins. Please try again later.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + Math.min(30, Math.pow(2, attempts - 5)) * 60 * 1000) : null;
      await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: attempts, lockedUntil } });
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

    // If MFA is enabled, issue a short-lived mfaToken instead of full session
    const fullUser = await User.findById(user._id).select('+mfaSecret');
    if (fullUser.mfaEnabled) {
      const mfaToken = jwt.sign(
        { id: user._id, mfaPending: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        mfaRequired: true,
        mfaToken,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockedUntil: null } });

    const requestedFirmId = req.body.firmId || null;
    let membership = requestedFirmId ? await UserFirm.findOne({ userId: user._id, firmId: requestedFirmId, active: true }).lean() : null;
    if (!membership) membership = await UserFirm.findOne({ userId: user._id, isDefault: true, active: true }).lean();
    if (!membership) membership = await UserFirm.findOne({ userId: user._id, active: true }).sort({ createdAt: 1 }).lean();
    if (!membership) {
      if (config.isProduction) {
        return res.status(403).json({ error: 'No active firm membership. Complete controlled production setup before login.' });
      }
      const firm = await Firm.create({ name: 'Default Firm' });
      membership = await UserFirm.create({ userId: user._id, firmId: firm._id, role: user.role, isDefault: true });
    }
    const token = issueAccessToken(user, membership.firmId, membership.role);
    const refreshToken = await issueRefreshToken({ userId: user._id, firmId: membership.firmId, req });

    res.json({ token, refreshToken, expiresIn: config.accessTokenTtl, firmId: String(membership.firmId),
      user: { id: user._id, name: user.name, email: user.email, role: membership.role, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword, mfaEnabled: false }
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


// Rotate refresh token and issue a short-lived access token.
router.post('/refresh', async (req, res) => {
  try {
    const raw = req.body.refreshToken;
    if (!raw) return res.status(401).json({ error: 'Refresh token required' });
    const session = await RefreshSession.findOne({ tokenHash: hashRefreshToken(raw), revokedAt: null }).lean();
    if (!session || session.expiresAt <= new Date()) return res.status(401).json({ error: 'Refresh token expired or revoked' });
    const user = await User.findById(session.userId).lean();
    if (!user) return res.status(401).json({ error: 'Session is no longer valid' });
    const membership = await UserFirm.findOne({ userId: user._id, firmId: session.firmId, active: true }).lean();
    if (!membership) return res.status(401).json({ error: 'Session is no longer valid' });

    // Atomically consume the refresh token so concurrent refresh requests cannot
    // successfully rotate the same session more than once.
    const consumed = await RefreshSession.findOneAndUpdate(
      { _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date() } },
      { new: true }
    ).lean();
    if (!consumed) return res.status(401).json({ error: 'Refresh token expired or already used' });
    const nextRefresh = await issueRefreshToken({ userId: user._id, firmId: membership.firmId, req });
    const token = issueAccessToken(user, membership.firmId, membership.role);
    res.json({ token, refreshToken: nextRefresh, expiresIn: config.accessTokenTtl, firmId: String(membership.firmId) });
  } catch (err) { res.status(500).json({ error: 'Unable to refresh session' }); }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    if (req.body.refreshToken) await RefreshSession.updateOne({ tokenHash: hashRefreshToken(req.body.refreshToken), userId: req.user.id }, { $set: { revokedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Unable to logout' }); }
});

router.get('/firms', authenticateToken, async (req, res) => {
  const memberships = await UserFirm.find({ userId: req.user.id, active: true }).populate('firmId', 'name legalName gstin email phone address city state stateCode country pincode currency timezone active').lean();
  res.json(memberships.map(m => ({ ...m.firmId, membershipId: m._id, role: m.role, isDefault: m.isDefault })));
});

router.post('/firms/switch', authenticateToken, async (req, res) => {
  const { firmId } = req.body;
  const membership = await UserFirm.findOne({ userId: req.user.id, firmId, active: true }).lean();
  if (!membership) return res.status(403).json({ error: 'You do not have access to this firm' });
  const user = await User.findById(req.user.id).lean();
  const token = issueAccessToken(user, firmId, membership.role);
  await UserFirm.updateOne({ _id: membership._id }, { $set: { lastSelectedAt: new Date() } });
  res.json({ token, firmId: String(firmId), role: membership.role, expiresIn: config.accessTokenTtl });
});

// GET /api/auth/me — Verify token and get profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -mfaSecret').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users — List all users (requires user:view)
router.get('/users', authenticateToken, authorize('user:view'), async (req, res) => {
  try {
    const memberships = await UserFirm.find({ firmId: req.user.firmId, active: true }).lean();
    const ids = memberships.map(m => m.userId);
    const users = await User.find({ _id: { $in: ids } }).select('-password').lean();
    const roleByUser = new Map(memberships.map(m => [String(m.userId), m.role]));
    res.json(users.map(u => ({ ...u, role: roleByUser.get(String(u._id)) || u.role, firmId: req.user.firmId })));
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

    const membership = await UserFirm.findOne({ userId: req.params.id, firmId: req.user.firmId, active: true });
    if (!membership) return res.status(404).json({ error: 'User is not a member of the active firm' });
    if (role !== undefined) membership.role = role;
    await membership.save();
    if (canAccessCash !== undefined) await User.updateOne({ _id: req.params.id }, { $set: { canAccessCash } });
    const user = await User.findById(req.params.id).select('-password').lean();
    res.json({ ...user, role: membership.role, firmId: req.user.firmId });
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
    
    const membership = await UserFirm.findOneAndUpdate({ userId: req.params.id, firmId: req.user.firmId, active: true }, { $set: { active: false } }, { new: true });
    if (!membership) return res.status(404).json({ error: 'User is not a member of the active firm' });
    res.json({ message: 'User removed from the active firm', userId: req.params.id, firmId: req.user.firmId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/whatsapp/send-otp — Generate and deliver an OTP via configured WhatsApp provider
router.post('/whatsapp/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Please enter a valid phone number' });

    const allowMock = process.env.ALLOW_MOCK_OTP === 'true' || config.isProduction === false;
    if (config.isProduction && (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.whatsappNumber)) {
      return res.status(503).json({ error: 'WhatsApp OTP provider is not configured', code: 'OTP_PROVIDER_NOT_CONFIGURED' });
    }

    const code = allowMock && process.env.NODE_ENV === 'test'
      ? '123456'
      : Math.floor(100000 + Math.random() * 900000).toString();
    const delivery = await sendWhatsAppNotification(cleanPhone, `Your Shekhar Bandhu Aushadhalaya verification code is ${code}. It expires in 5 minutes.`);
    if (!delivery?.success || (config.isProduction && delivery.simulated)) {
      return res.status(503).json({ error: 'Unable to deliver verification code', code: 'OTP_DELIVERY_FAILED' });
    }

    await Otp.findOneAndUpdate(
      { phone: cleanPhone },
      { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Verification code sent to WhatsApp', ...(config.isProduction ? {} : { devOtp: code }) });
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

// POST /api/auth/forgot-password — Initiate password reset via email/OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required' });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.json({ message: 'If that email address is registered, a password reset code has been issued.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { phone: `email:${user.email}` },
      { code, expiresAt },
      { upsert: true, new: true }
    );

    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const { enqueue } = require('../../services/jobQueue');
      await enqueue('email.send', { to: user.email, subject: 'Password reset code', text: `Your password reset OTP is ${code}. It expires in 15 minutes.`, html: `<p>Your password reset OTP is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>` });
    } else if (!config.isProduction) { console.log(`[PASSWORD RESET OTP DEV] ${user.email}: ${code}`); }

    res.json({ message: 'If that email address is registered, a password reset code has been issued.', resetToken: `email:${user.email}`, ...(config.isProduction ? {} : { devOtp: code }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password — Complete password reset with code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and newPassword are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpRecord = await Otp.findOne({ phone: `email:${cleanEmail}` });
    if (!otpRecord || otpRecord.code !== code.trim() || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    await user.save();

    await Otp.deleteOne({ phone: `email:${cleanEmail}` });

    res.json({ message: 'Password reset successfully. You may now log in with your new password.' });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'PASSWORD_RESET',
      description: `Password reset completed for ${user.email}`,
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/sessions — View active logged-in device sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('activeSessions').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.activeSessions || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/sessions/:sessionId — Revoke a logged-in device session
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.activeSessions = (user.activeSessions || []).filter(s => s.sessionId !== req.params.sessionId);
    await user.save();

    res.json({ message: 'Device session revoked successfully', sessionId: req.params.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { registerJobHandler } = require('../../services/jobQueue');
registerJobHandler('email.send', async payload => { const { sendEmail } = require('../../services/emailService'); return sendEmail(payload); });

module.exports = { router, authenticateToken };
