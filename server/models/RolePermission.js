const mongoose = require('mongoose');
const { getDefaultPermissionsForRole } = require('../utils/permissions');
const tenantPlugin = require('../utils/tenantPlugin');

const BUILTIN_ROLES = ['admin', 'manager', 'agent', 'mr'];

const rolePermissionSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    unique: true,
  },
  permissions: {
    type: [String],
    default: [],
  },
  mfaPermissions: {
    type: [String],
    default: [],
  },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  isCustom: { type: Boolean, default: false },
}, { timestamps: true });

rolePermissionSchema.plugin(tenantPlugin);

rolePermissionSchema.statics.getEffectivePermissions = async function (role) {
  const doc = await this.findOne({ role });
  if (doc && doc.permissions) {
    const perms = doc.permissions;
    // Admin role always gets wildcard regardless of DB state
    if (role === 'admin' && !perms.includes('*')) {
      return { permissions: [...perms, '*'], mfaPermissions: doc.mfaPermissions || [] };
    }
    return { permissions: perms, mfaPermissions: doc.mfaPermissions || [] };
  }
  return { permissions: getDefaultPermissionsForRole(role), mfaPermissions: [] };
};

rolePermissionSchema.statics.seedDefaults = async function () {
  for (const role of BUILTIN_ROLES) {
    const defaults = getDefaultPermissionsForRole(role);
    const existing = await this.findOne({ role });
    if (!existing) {
      await this.create({
        role,
        permissions: defaults,
        label: role.charAt(0).toUpperCase() + role.slice(1),
        description: `${role} role with default permissions`,
        isCustom: false,
      });
      continue;
    }
    // Built-in, non-custom role documents track newly introduced default permissions.
    // Custom roles are never modified by seeding/migrations.
    if (!existing.isCustom) {
      const merged = [...new Set([...(existing.permissions || []), ...defaults])];
      if (merged.length !== (existing.permissions || []).length) {
        existing.permissions = merged;
        await existing.save();
      }
    }
  }
};

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
module.exports.BUILTIN_ROLES = BUILTIN_ROLES;
