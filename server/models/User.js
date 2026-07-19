const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: {
    type: String,
    default: 'agent',
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
