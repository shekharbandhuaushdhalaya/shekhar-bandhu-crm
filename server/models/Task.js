const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  desc: { type: String, default: '', trim: true },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  dueDate: { type: Date, required: true },
  completed: { type: Boolean, default: false },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  overdueNotifiedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

taskSchema.index({ dueDate: 1 });
taskSchema.index({ assignedTo: 1, completed: 1 });

taskSchema.virtual('isOverdue').get(function () {
  return !this.completed && Boolean(this.dueDate) && new Date(this.dueDate) < new Date();
});

module.exports = mongoose.model('Task', taskSchema);
