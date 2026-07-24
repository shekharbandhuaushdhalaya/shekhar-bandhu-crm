const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  message:   { type: String, required: true, trim: true },
  type:      { type: String, enum: ['info', 'alert', 'compliance', 'system'], default: 'info' },
  isRead:    { type: Boolean, default: false },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Null represents a global broadcast
  link:      { type: String, default: '' },
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
