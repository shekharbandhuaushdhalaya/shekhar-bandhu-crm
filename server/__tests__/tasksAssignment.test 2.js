const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { checkOverdueTasks } = require('../utils/taskOverdueChecker');

jest.mock('../models/Notification');

describe('Task Assignment and Overdue Detection Logic', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('computes isOverdue virtual correctly when uncompleted and past due', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const overdueTask = new Task({ title: 'Overdue Task', completed: false, dueDate: yesterday });
    const pendingTask = new Task({ title: 'Upcoming Task', completed: false, dueDate: tomorrow });
    const completedTask = new Task({ title: 'Done Task', completed: true, dueDate: yesterday });

    expect(overdueTask.isOverdue).toBe(true);
    expect(pendingTask.isOverdue).toBe(false);
    expect(completedTask.isOverdue).toBe(false);
  });

  it('creates overdue notifications for assigned uncompleted tasks', async () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const mockTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Prepare GST Return',
      dueDate: pastDate,
      assignedTo: 'user_123',
      completed: false,
      overdueNotifiedAt: null,
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(Task, 'find').mockResolvedValue([mockTask]);
    Notification.create.mockResolvedValue({ _id: 'notif_1' });

    await checkOverdueTasks(null);

    expect(Task.find).toHaveBeenCalledWith({
      completed: false,
      dueDate: { $lt: expect.any(Date) },
      overdueNotifiedAt: null,
      assignedTo: { $ne: null }
    });

    expect(Notification.create).toHaveBeenCalledWith({
      title: 'Task overdue',
      message: expect.stringContaining('Prepare GST Return'),
      type: 'alert',
      userId: 'user_123',
      link: '/tasks'
    });

    expect(mockTask.save).toHaveBeenCalled();
    expect(mockTask.overdueNotifiedAt).toBeInstanceOf(Date);

    Task.find.mockRestore();
  });
});
