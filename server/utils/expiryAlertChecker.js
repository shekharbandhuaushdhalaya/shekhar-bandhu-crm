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

    // 4. Check Manufacturing License & GMP Certificate Expiries (SystemSettings & Vendor)
    const SystemSettings = require('../models/SystemSettings');
    const Vendor = require('../models/Vendor');

    const settings = await SystemSettings.findOne().lean();
    if (settings) {
      if (settings.licenseValidTill && new Date(settings.licenseValidTill) <= d90) {
        const expDate = new Date(settings.licenseValidTill);
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        const title = `Manufacturing License Expiry Warning (${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} Days`})`;
        const message = `In-house Manufacturing License (${settings.manufacturingLicenseNo || 'N/A'}) ${daysLeft <= 0 ? 'has EXPIRED' : `expires on ${expDate.toLocaleDateString()}`}.`;
        const existing = await Notification.findOne({ title, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } });
        if (!existing) {
          await Notification.create({ title, message, type: 'alert', link: '/settings' });
        }
      }

      if (settings.gmpValidTill && new Date(settings.gmpValidTill) <= d90) {
        const expDate = new Date(settings.gmpValidTill);
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        const title = `GMP Certificate Expiry Warning (${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} Days`})`;
        const message = `GMP Certificate (${settings.gmpCertificateNo || 'N/A'}) ${daysLeft <= 0 ? 'has EXPIRED' : `expires on ${expDate.toLocaleDateString()}`}.`;
        const existing = await Notification.findOne({ title, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } });
        if (!existing) {
          await Notification.create({ title, message, type: 'alert', link: '/settings' });
        }
      }
    }

    const expiringVendors = await Vendor.find({
      manufacturingLicenseExpiry: { $ne: null, $lte: d90 }
    }).lean();

    for (const v of expiringVendors) {
      const expDate = new Date(v.manufacturingLicenseExpiry);
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const vName = v.company || v.name || 'Vendor';

      const title = `Job-Work Vendor License Expiry: ${vName}`;
      const message = `Vendor "${vName}" manufacturing license ${daysLeft <= 0 ? 'has EXPIRED' : `expires on ${expDate.toLocaleDateString()}`}.`;
      const existing = await Notification.findOne({ title, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } });
      if (!existing) {
        await Notification.create({ title, message, type: 'alert', link: '/vendors' });
      }
    }

    // 5. Check Retention/Reference Samples Approaching Disposal Date
    const RetentionSample = require('../models/RetentionSample');
    const dueRetentionSamples = await RetentionSample.find({
      status: 'stored',
      retentionUntil: { $ne: null, $lte: d90 }
    }).lean();

    for (const rs of dueRetentionSamples) {
      const expDate = new Date(rs.retentionUntil);
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const title = `Retention Sample Disposal Warning: ${rs.batchNo}`;
      const message = `Reference sample for batch ${rs.batchNo} (${rs.productName}) ${daysLeft <= 0 ? 'is DUE for disposal' : `reaches mandatory retention limit on ${expDate.toLocaleDateString()}`}.`;
      const existing = await Notification.findOne({ title, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } });
      if (!existing) {
        await Notification.create({ title, message, type: 'compliance', link: '/manufacturing' });
      }
    }
  } catch (err) {
    console.error('Error running expiry & reorder checker:', err.message);
  }
}

module.exports = {
  checkExpiriesAndReorders
};
