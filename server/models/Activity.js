const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['system', 'call', 'email', 'meeting', 'note'],
    default: 'system',
  },
  text: { type: String, required: true },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null,
  },
}, { timestamps: true });

activitySchema.index({ createdAt: -1 });

activitySchema.plugin(tenantPlugin);
module.exports = mongoose.model('Activity', activitySchema);
