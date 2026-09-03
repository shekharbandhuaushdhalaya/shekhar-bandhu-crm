const express = require('express');
const Task = require('../../models/Task');
const Notification = require('../../models/Notification');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/tasks — list tasks with optional filter (?filter=pending|completed|overdue & ?assignedTo=userId|me)
router.get('/', authorize('task:view'), async (req, res) => {
  try {
    const { filter, assignedTo } = req.query;
    const query = {};

    if (filter === 'pending') {
      query.completed = false;
    } else if (filter === 'completed') {
      query.completed = true;
    } else if (filter === 'overdue') {
      query.completed = false;
      query.dueDate = { $lt: new Date() };
    }

    if (assignedTo) {
      if (assignedTo === 'me') {
        query.assignedTo = req.user ? req.user.id : null;
      } else {
        query.assignedTo = assignedTo;
      }
    }

    const now = new Date();
    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .sort({ dueDate: 1 })
      .lean();

    const result = tasks.map(t => ({
      ...t,
      isOverdue: !t.completed && Boolean(t.dueDate) && new Date(t.dueDate) < now
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — create task
router.post('/', authorize('task:create'), validate(schemas.taskSchema), async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const currentUserId = req.user ? req.user.id : null;

    const taskData = {
      ...req.body,
      assignedBy: assignedTo ? currentUserId : null
    };

    const task = await Task.create(taskData);

    if (task.assignedTo && currentUserId && task.assignedTo.toString() !== currentUserId.toString()) {
      const notif = await Notification.create({
        title: 'New task assigned to you',
        message: task.title,
        type: 'info',
        userId: task.assignedTo,
        link: '/tasks'
      });
      if (req.io) {
        req.io.emit('notification_updated', notif);
      }
    }

    if (req.io) {
      req.io.emit('task_updated', { type: 'created', id: task._id });
    }
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tasks/:id/assign — assign or reassign task
router.put('/:id/assign', authorize('task:edit'), async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const currentUserId = req.user ? req.user.id : null;

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const oldAssignee = task.assignedTo ? task.assignedTo.toString() : null;
    const newAssignee = assignedTo ? assignedTo.toString() : null;

    if (oldAssignee !== newAssignee) {
      task.assignedTo = assignedTo || null;
      task.assignedBy = assignedTo ? currentUserId : null;
      await task.save();

      if (newAssignee && (!currentUserId || newAssignee !== currentUserId.toString())) {
        const notif = await Notification.create({
          title: 'Task assigned to you',
          message: task.title,
          type: 'info',
          userId: task.assignedTo,
          link: '/tasks'
        });
        if (req.io) {
          req.io.emit('notification_updated', notif);
        }
      }

      if (req.io) {
        req.io.emit('task_updated', { type: 'assigned', id: task._id });
      }
    }

    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tasks/:id/toggle — toggle completed
router.put('/:id/toggle', authorize('task:edit'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.completed = !task.completed;
    await task.save();

    if (req.io) {
      req.io.emit('task_updated', { type: 'toggled', id: task._id, completed: task.completed });
    }

    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tasks/:id — update task
router.put('/:id', authorize('task:edit'), validate(schemas.taskSchema.partial()), async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.io) {
      req.io.emit('task_updated', { type: 'updated', id: task._id });
    }

    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', authorize('task:delete'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (req.io) {
      req.io.emit('task_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
