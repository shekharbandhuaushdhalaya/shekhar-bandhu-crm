const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

counterSchema.plugin(tenantPlugin);
module.exports = mongoose.model('Counter', counterSchema);
