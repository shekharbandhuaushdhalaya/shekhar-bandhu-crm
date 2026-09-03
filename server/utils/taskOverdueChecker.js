const Task = require('../models/Task');
const Notification = require('../models/Notification');

/**
 * Checks for overdue uncompleted tasks that have an assignee and haven't been notified yet.
 * Creates an alert Notification for assignedTo user and sets overdueNotifiedAt.
 */
async function checkOverdueTasks(io) {
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
        io.emit('notification_updated', notif);
        io.emit('task_updated', { type: 'overdue_alert', id: task._id });
      }
    }
  } catch (err) {
    console.error('❌ Error checking overdue tasks:', err.message);
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
