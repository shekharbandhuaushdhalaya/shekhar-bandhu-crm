const Task = require('../models/Task');
const Notification = require('../models/Notification');
const Firm = require('../models/Firm');
const { runWithTenant } = require('./tenantContext');

/**
 * Checks for overdue uncompleted tasks that have an assignee and haven't been notified yet.
 * Creates an alert Notification for assignedTo user and sets overdueNotifiedAt.
 */
async function checkOverdueTasksForCurrentFirm(io, firmId) {
  try {
    const now = new Date();
    const overdueTasks = await Task.find({
      completed: false,
      dueDate: { $lt: now },
      overdueNotifiedAt: null,
      assignedTo: { $ne: null }
    });

    for (const task of overdueTasks) {
      const dateStr = new Date(task.dueDate).toLocaleDateString('en-IN');
      const notif = await Notification.create({
        title: 'Task overdue',
        message: `Task "${task.title}" was due on ${dateStr}`,
        type: 'alert',
        userId: task.assignedTo,
        link: '/tasks'
      });

      task.overdueNotifiedAt = now;
      await task.save();

      if (io) {
        const room = firmId ? io.to(`firm:${firmId}`) : null;
        if (room) {
          room.emit('notification_updated', notif);
          room.emit('task_updated', { type: 'overdue_alert', id: task._id });
        }
      }
    }
  } catch (err) {
    console.error('❌ Error checking overdue tasks:', err.message);
  }
}

async function checkOverdueTasks(io) {
  const firms = await Firm.find({ active: { $ne: false } }).select('_id').lean();
  for (const firm of firms) {
    await runWithTenant({ firmId: firm._id }, () => checkOverdueTasksForCurrentFirm(io, String(firm._id)));
  }
}

/**
 * Starts the hourly interval checker for overdue tasks.
 */
function startOverdueTaskChecker(io, intervalMs = 60 * 60 * 1000) {
  // Execute initial check on startup
  checkOverdueTasks(io).catch(() => {});

  // Schedule periodic interval
  return setInterval(() => {
    checkOverdueTasks(io).catch(() => {});
  }, intervalMs);
}

module.exports = {
  checkOverdueTasks,
  startOverdueTaskChecker
};
