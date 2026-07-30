/**
 * MFA Routes — TOTP (Google Authenticator / Authy)
 * 
 * POST /api/auth/mfa/setup         — Generate secret + QR code (logged-in user)
 * POST /api/auth/mfa/verify-setup  — Confirm TOTP code to activate MFA
 * POST /api/auth/mfa/verify        — Verify TOTP during login (uses mfaToken)
 * POST /api/auth/mfa/disable       — Disable MFA (requires password + TOTP code)
 * PUT  /api/auth/mfa/admin-disable — Admin force-disable for any user
 */

const express = require('express');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { logAction } = require('../../utils/auditLogger');
const config = require('../../src/config');

const router = express.Router();
const JWT_SECRET = config.jwtSecret;

// Inline authenticateToken (same as auth.js)
const authenticateToken = (req, res, next) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/setup
// Generates a new TOTP secret and QR code URI for the authenticated user.
// The secret is stored as "pending" on the user until verify-setup confirms it.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/setup', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'MFA is already enabled. Disable it first.' });
    }

    // Generate a new TOTP secret
    const secret = speakeasy.generateSecret({
      name: `ShekharBandhu CRM (${user.email})`,
      issuer: 'Shekhar Bandhu Aushadhalaya',
      length: 20,
    });

    // Store the secret (unconfirmed — will be activated after verify-setup)
    user.mfaSecret = secret.base32;
    user.mfaEnabled = false; // not active yet
    await user.save();

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32, // show once so user can manually enter if camera not available
      qrCode: qrCodeDataUrl,
      otpauthUrl: secret.otpauth_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/verify-setup
// Confirms the TOTP secret by checking a code from the authenticator app.
// Activates MFA on success.
// Body: { token: "123456" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-setup', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'TOTP code is required' });

    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.mfaSecret) return res.status(400).json({ error: 'No MFA setup in progress. Run /setup first.' });
    if (user.mfaEnabled) return res.status(400).json({ error: 'MFA is already active' });

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: token.toString().trim(),
      window: 1, // allow 30s clock drift
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    user.mfaEnabled = true;
    await user.save();

    await logAction({
      action: 'MFA_ENABLED',
      description: `MFA (TOTP) enabled by user: ${user.name} (${user.email})`,
      req,
    });

    res.json({ success: true, message: 'MFA enabled successfully. Save your authenticator — codes are required on every login.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/verify
// Called during login when mfaRequired=true.
// Body: { mfaToken: "<short-lived JWT>", totpCode: "123456" }
// Returns: full session JWT on success.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const { mfaToken, totpCode } = req.body;
    if (!mfaToken || !totpCode) {
      return res.status(400).json({ error: 'mfaToken and totpCode are required' });
    }

    // Verify the short-lived MFA token
    let decoded;
    try {
      decoded = jwt.verify(mfaToken, JWT_SECRET);
    } catch (e) {
      return res.status(403).json({ error: 'MFA session expired. Please login again.' });
    }

    if (!decoded.mfaPending) {
      return res.status(403).json({ error: 'Invalid MFA token.' });
    }

    const user = await User.findById(decoded.id).select('+mfaSecret');
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ error: 'MFA is not configured for this account.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode.toString().trim(),
      window: 1,
    });

    if (!verified) {
      await logAction({
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        action: 'MFA_VERIFY_FAILED',
        description: `Failed MFA verification attempt for: ${user.email}`,
        req,
      });
      return res.status(400).json({ error: 'Invalid authentication code. Please try again.' });
    }

    // Issue full session JWT
    const fullToken = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAction({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'LOGIN_SUCCESS_MFA',
      description: `User completed MFA login: ${user.name} (${user.email})`,
      req,
    });

    res.json({
      token: fullToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, canAccessCash: user.canAccessCash, mustChangePassword: user.mustChangePassword },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/disable
// User disables their own MFA. Requires password + current TOTP code.
// Body: { password: "...", totpCode: "123456" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/disable', authenticateToken, async (req, res) => {
  try {
    const { password, totpCode } = req.body;
    if (!password || !totpCode) {
      return res.status(400).json({ error: 'Password and TOTP code are required to disable MFA.' });
    }

    const user = await User.findById(req.user.id).select('+mfaSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.mfaEnabled) return res.status(400).json({ error: 'MFA is not enabled.' });

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(400).json({ error: 'Invalid password.' });

    // Verify TOTP
    const totpValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode.toString().trim(),
      window: 1,
    });

    if (!totpValid) return res.status(400).json({ error: 'Invalid authentication code.' });

    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();

    await logAction({
      action: 'MFA_DISABLED',
      description: `MFA disabled by user: ${user.name} (${user.email})`,
      req,
    });

    res.json({ success: true, message: 'MFA has been disabled. Your account now uses password-only login.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/mfa/admin-disable/:userId
// Admin force-disables MFA for any user (e.g. lost phone).
// Requires admin token with user:edit permission.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/admin-disable/:userId', authenticateToken, async (req, res) => {
  try {
    // Only admins / users with user:edit can do this
    const { authorize } = require('../../middleware/authorize');
    const { getRolePermissions } = require('../../middleware/authorize');
    const { hasPermission } = require('../../utils/permissions');
    const rolePerms = await getRolePermissions(req.user.role);
    if (!hasPermission(rolePerms, 'user:edit') && !rolePerms.includes('*')) {
      return res.status(403).json({ error: 'Access denied. Requires user:edit permission.' });
    }

    const user = await User.findById(req.params.userId).select('+mfaSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();

    await logAction({
      action: 'MFA_ADMIN_DISABLED',
      description: `Admin ${req.user.name} force-disabled MFA for user: ${user.name} (${user.email})`,
      req,
    });

    res.json({ success: true, message: `MFA disabled for ${user.name}. They can re-enable from their Profile.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
