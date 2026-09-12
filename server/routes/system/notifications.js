const express = require('express');
const router = express.Router();
const Notification = require('../../models/Notification');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const InventoryEntry = require('../../models/InventoryEntry');
const { authorize } = require('../../middleware/authorize');

// GET /api/notifications — Retrieve notifications for current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const filter = {
      $or: [
        { userId: userId },
        { userId: null }
      ]
    };
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json(notifications.map(n => ({
      ...n,
      isRead: n.userId ? Boolean(n.isRead) : (n.readBy || []).some(id => String(id) === String(userId)),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read — Mark a notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const notification = await Notification.findOne({ _id: req.params.id, $or: [{ userId }, { userId: null }] });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (notification.userId) notification.isRead = true;
    else if (userId && !(notification.readBy || []).some(id => String(id) === String(userId))) notification.readBy.push(userId);
    await notification.save();
    if (req.io) {
      req.io.emit('notification_updated', { type: 'read', id: notification._id });
    }
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/read-all — Mark all notifications as read
router.post('/read-all', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
    if (userId) await Notification.updateMany({ userId: null, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } });
    res.json({ success: true, message: 'All notifications marked as read for this user' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/alerts/check — Check and trigger alerts for low stock, expiring licenses, and expiring batches
router.get('/alerts/check', authorize('report:view'), async (req, res) => {
  try {
    const alertsCreated = [];

    // 1. Check low stock levels
    const lowStockProducts = await Product.find({
      $expr: { $lte: ['$stockLevel', '$minReorder'] }
    }).lean();

    for (const p of lowStockProducts) {
      const title = 'Low Stock Warning';
      const message = `Product "${p.name}" (${p.sku || 'N/A'}) is running below minimum reorder point. Current: ${p.stockLevel}, Min: ${p.minReorder}`;
      
      const existing = await Notification.findOne({ title, message, isRead: false }).lean();
      if (!existing) {
        const notif = await Notification.create({ title, message, type: 'alert', link: '/inventory' });
        alertsCreated.push(notif);
      }
    }

    // 2. Check expiring drug licenses
    const licenseThreshold = new Date();
    licenseThreshold.setDate(licenseThreshold.getDate() + 60);

    const expiringCustomers = await Customer.find({
      drugLicenseExpiry: { $ne: null, $lte: licenseThreshold }
    }).lean();

    for (const c of expiringCustomers) {
      const title = 'Customer Drug License Expiry';
      const expiryStr = new Date(c.drugLicenseExpiry).toLocaleDateString('en-IN');
      const message = `Customer "${c.company || c.name}" license (${c.drugLicenseNo || 'N/A'}) is expiring soon on ${expiryStr}`;

      const existing = await Notification.findOne({ title, message, isRead: false }).lean();
      if (!existing) {
        const notif = await Notification.create({ title, message, type: 'compliance', link: '/customers' });
        alertsCreated.push(notif);
      }
    }

    const expiringVendors = await Vendor.find({
      manufacturingLicenseExpiry: { $ne: null, $lte: licenseThreshold }
    }).lean();

    for (const v of expiringVendors) {
      const title = 'Vendor License Expiry';
      const expiryStr = new Date(v.manufacturingLicenseExpiry).toLocaleDateString('en-IN');
      const message = `Vendor "${v.company || v.name}" manufacturing license (${v.manufacturingLicenseNo || 'N/A'}) is expiring soon on ${expiryStr}`;

      const existing = await Notification.findOne({ title, message, isRead: false }).lean();
      if (!existing) {
        const notif = await Notification.create({ title, message, type: 'compliance', link: '/vendors' });
        alertsCreated.push(notif);
      }
    }

    // 3. Check expiring inventory batches
    const batchThreshold = new Date();
    batchThreshold.setDate(batchThreshold.getDate() + 90);

    const expiringBatches = await InventoryEntry.find({
      qtyBoxes: { $gt: 0 },
      expiryDate: { $ne: null, $lte: batchThreshold }
    }).populate('productId', 'name').lean();

    for (const entry of expiringBatches) {
      const title = 'Batch Expiry Warning';
      const expiryStr = new Date(entry.expiryDate).toLocaleDateString('en-IN');
      const pName = entry.productId ? entry.productId.name : entry.productType;
      const message = `Batch "${entry.batchNo || 'N/A'}" of "${pName}" is expiring soon on ${expiryStr} (${entry.qtyBoxes} boxes left)`;

      const existing = await Notification.findOne({ title, message, isRead: false }).lean();
      if (!existing) {
        const notif = await Notification.create({ title, message, type: 'compliance', link: '/inventory' });
        alertsCreated.push(notif);
      }
    }

    res.json({
      success: true,
      message: 'Compliance checks completed successfully',
      createdAlertsCount: alertsCreated.length,
      alerts: alertsCreated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
