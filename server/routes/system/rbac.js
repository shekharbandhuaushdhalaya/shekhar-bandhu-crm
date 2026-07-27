const express = require('express');
const RolePermission = require('../../models/RolePermission');
const User = require('../../models/User');
const { authorize, clearPermissionCache } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { getAllPermissions, getDefaultPermissionsForRole } = require('../../utils/permissions');

const router = express.Router();

// GET /api/rbac/permissions — List all possible permissions + role configs
router.get('/permissions', authorize('rbac:manage', 'user:view'), async (req, res) => {
  try {
    const allPerms = getAllPermissions();
    const roleConfigs = await RolePermission.find({}).sort({ role: 1 }).lean();
    const grouped = {};
    for (const p of allPerms) {
      const [resource] = p.split(':');
      if (!grouped[resource]) grouped[resource] = [];
      grouped[resource].push(p);
    }
    res.json({
      allPermissions: allPerms,
      grouped,
      roles: roleConfigs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rbac/permissions — Create a new custom role
router.post('/permissions', authorize('rbac:manage'), validate(schemas.rbacPermissionsSchema), async (req, res) => {
  try {
    const { role, permissions, label, description } = req.body;
    if (!role || !role.trim()) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    const normalizedRole = role.trim().toLowerCase().replace(/\s+/g, '_');
    const existing = await RolePermission.findOne({ role: normalizedRole });
    if (existing) {
      return res.status(409).json({ error: `Role "${normalizedRole}" already exists` });
    }
    const allPerms = getAllPermissions();
    const perms = Array.isArray(permissions) ? permissions : [];
    const invalid = perms.filter(p => p !== '*' && !allPerms.includes(p));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
    }
    const config = await RolePermission.create({
      role: normalizedRole,
      permissions: perms,
      label: label || normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1),
      description: description || `Custom role: ${normalizedRole}`,
      isCustom: true,
    });
    clearPermissionCache();
    if (req.io) {
      req.io.emit('rbac_updated', { type: 'created' });
    }
    res.status(201).json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rbac/permissions/:role — Update permissions for a role
router.put('/permissions/:role', authorize('rbac:manage'), validate(schemas.rbacPermissionsSchema), async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions, label, description } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }

    const allPerms = getAllPermissions();
    const invalid = permissions.filter(p => p !== '*' && !allPerms.includes(p));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
    }

    let config = await RolePermission.findOne({ role });
    if (!config) {
      config = new RolePermission({ role, isCustom: false });
    }
    config.permissions = permissions;
    if (label !== undefined) config.label = label;
    if (description !== undefined) config.description = description;
    await config.save();

    clearPermissionCache();

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rbac/permissions/:role — Delete a custom role
router.delete('/permissions/:role', authorize('rbac:manage'), async (req, res) => {
  try {
    const { role } = req.params;
    const BUILTIN_ROLES = ['admin', 'manager', 'agent'];
    if (BUILTIN_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Cannot delete built-in roles' });
    }
    const config = await RolePermission.findOneAndDelete({ role });
    if (!config) {
      return res.status(404).json({ error: 'Role not found' });
    }
    // Reassign users with this role to 'agent'
    await User.updateMany({ role }, { role: 'agent' });
    clearPermissionCache();
    if (req.io) {
      req.io.emit('rbac_updated', { type: 'updated' });
    }
    res.json({ message: `Role "${role}" deleted. Affected users reassigned to agent.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rbac/permissions/:role/reset — Reset role to default permissions (built-in only)
router.post('/permissions/:role/reset', authorize('rbac:manage'), async (req, res) => {
  try {
    const { role } = req.params;
    const defaults = getDefaultPermissionsForRole(role);
    if (!defaults || defaults.length === 0) {
      return res.status(400).json({ error: `No default permissions defined for role "${role}". Built-in roles: admin, manager, agent` });
    }
    let config = await RolePermission.findOne({ role });
    if (!config) {
      config = new RolePermission({ role, isCustom: false });
    }
    config.permissions = defaults;
    await config.save();

    clearPermissionCache();

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rbac/my-permissions — Get current user's effective permissions
router.get('/my-permissions', async (req, res) => {
  try {
    const role = req.user.role;
    const config = await RolePermission.findOne({ role });
    const permissions = config
      ? config.permissions
      : getDefaultPermissionsForRole(role);
    res.json({ role, permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;