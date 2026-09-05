const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    required: true,
    default: 'agent',
    validate: {
      validator: async function(value) {
        const BUILTIN_ROLES = ['admin', 'manager', 'agent'];
        if (BUILTIN_ROLES.includes(value)) {
          return true;
        }
        const RolePermission = mongoose.model('RolePermission');
        const roleExists = await RolePermission.exists({ role: value });
        return !!roleExists;
      },
      message: props => `${props.value} is not a valid role.`
    }
  },
  canAccessCash: {
    type: Boolean,
    default: false,
  },
  lastActive: {
    type: Date,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  deviceInfo: {
    type: String,
    default: null,
  },
  mustChangePassword: {
    type: Boolean,
    default: true,
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
  mfaSecret: {
    type: String,
    default: null,
    select: false, // never returned in queries by default
  },
  activeSessions: [{
    sessionId: { type: String, required: true },
    deviceInfo: { type: String, default: 'Unknown Device' },
    ipAddress: { type: String, default: '127.0.0.1' },
    loggedInAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
