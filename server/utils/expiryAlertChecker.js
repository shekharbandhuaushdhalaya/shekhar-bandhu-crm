const InventoryEntry = require('../models/InventoryEntry');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const Product = require('../models/Product');
const RawMaterial = require('../models/RawMaterial');
const Notification = require('../models/Notification');

async function checkExpiriesAndReorders() {
  try {
    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 1. Check Raw Material Entries expiring soon
    const expiringRawMaterials = await RawMaterialEntry.find({
      qty: { $gt: 0 },
      expiryDate: { $ne: null, $lte: d90 }
    }).populate('rawMaterialId', 'name sku').lean();

    for (const rm of expiringRawMaterials) {
      const expDate = new Date(rm.expiryDate);
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const rmName = rm.rawMaterialId ? rm.rawMaterialId.name : 'Raw Material';

      let urgency = '30_days';
      if (daysLeft <= 30) urgency = '30_days';
      else if (daysLeft <= 60) urgency = '60_days';
      else urgency = '90_days';

      const title = `Raw Material Expiry Alert (${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} Days`})`;
      const message = `Batch ${rm.batchNo || 'N/A'} of raw material "${rmName}" (${rm.qty} remaining) ${daysLeft <= 0 ? 'has EXPIRED' : `expires on ${expDate.toLocaleDateString()}`}.`;

      const existingNotif = await Notification.findOne({
        title,
        message,
        createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
      });

      if (!existingNotif) {
        await Notification.create({
          title,
          message,
          type: daysLeft <= 30 ? 'alert' : 'info',
          link: '/manufacturing'
        });
      }
    }

    // 2. Check Low-Stock Reorder Levels
    const [rawMaterialsLow, productsLow] = await Promise.all([
      RawMaterial.find({ minReorder: { $gt: 0 } }).lean(),
      Product.find({ minReorderLevel: { $gt: 0 } }).lean()
    ]);

    for (const rm of rawMaterialsLow) {
      if ((rm.stockLevel || 0) <= rm.minReorder) {
        const title = `Low Stock Reorder Alert: ${rm.name}`;
        const message = `Raw Material "${rm.name}" stock level (${rm.stockLevel || 0} ${rm.unit}) is below minimum reorder point (${rm.minReorder} ${rm.unit}).`;
        const existing = await Notification.findOne({ title, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } });
        if (!existing) {
          await Notification.create({ title, message, type: 'alert', link: '/inventory' });
        }
      }
    // 3. Check MR Field Sample Bag Expiries
    const MrSampleBag = require('../models/MrSampleBag');
    const expiringSampleBags = await MrSampleBag.find({
      qty: { $gt: 0 },
      expiryDate: { $ne: null, $lte: d90 }
    }).populate('mrId', 'name phone').populate('productId', 'name sku').lean();

    for (const sb of expiringSampleBags) {
      const expDate = new Date(sb.expiryDate);
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const mrName = sb.mrId ? sb.mrId.name : 'MR';
      const prodName = sb.productId ? sb.productId.name : 'Sample Product';

      const title = `Field Sample Bag Expiry Alert: ${mrName}`;
      const message = `Sample product "${prodName}" (Batch: ${sb.batchNo || 'N/A'}, ${sb.qty} units) in ${mrName}'s sample bag ${daysLeft <= 0 ? 'has EXPIRED' : `expires in ${daysLeft} days`}.`;

      const existingNotif = await Notification.findOne({
        title,
        message,
        createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
      });

      if (!existingNotif) {
        await Notification.create({
          title,
          message,
          type: 'compliance',
          link: '/medical-reps'
        });
      }
    }
  } catch (err) {
    console.error('Error running expiry & reorder checker:', err.message);
  }
}

module.exports = {
  checkExpiriesAndReorders
};
