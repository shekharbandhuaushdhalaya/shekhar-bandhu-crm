const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
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
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
