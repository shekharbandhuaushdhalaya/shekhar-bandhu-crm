require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Contact = require('../models/Contact');
const Customer = require('../models/Customer');
const MrVisit = require('../models/MrVisit');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  const apply = env.MIGRATE_DOCTORS_APPLY === 'YES';
  if (apply && env.MIGRATE_DOCTORS_CONFIRM !== 'YES') {
    throw new Error('Applying doctor migration requires MIGRATE_DOCTORS_CONFIRM=YES.');
  }
  return { mongoUri, firmId, apply };
}

const doctorFieldFilter = [
  { category: { $in: ['A', 'B', 'C'] } },
  { specialty: { $ne: '', $exists: true } },
  { birthday: { $ne: null } },
  { anniversary: { $ne: null } },
  { preferredTime: { $ne: '', $exists: true } },
  { preferredVisitDay: { $ne: '', $exists: true } },
  { monthlySampleQuota: { $ne: null } }
];

function hasName(record) {
  return Boolean(record && typeof record.name === 'string' && record.name.trim());
}

function doctorPayload(record, source) {
  const isCustomer = source === 'Customer';
  const address = isCustomer && record.billingAddress ? record.billingAddress : {};
  return {
    name: record.name.trim(),
    clinicName: String(record.company || '').trim(),
    specialization: String(record.specialty || '').trim(),
    category: ['A', 'B', 'C'].includes(record.category) ? record.category : '',
    phone: record.phone || '',
    email: record.email || '',
    address: String(address.street || '').trim(),
    city: String(address.city || record.city || '').trim(),
    pincode: String(address.pin || '').trim(),
    latitude: record.latitude,
    longitude: record.longitude,
    birthday: record.birthday || null,
    anniversary: record.anniversary || null,
    preferredTime: String(record.preferredTime || '').trim(),
    preferredVisitDay: record.preferredVisitDay || '',
    monthlySampleQuota: record.monthlySampleQuota ?? null,
    assignedMrId: record.assignedMrId || null,
    areaName: String(record.areaName || '').trim(),
    linkedContactId: isCustomer ? null : record._id,
    linkedCustomerId: isCustomer ? record._id : null,
    notes: ''
  };
}

async function migrateDoctors(env = process.env) {
  const { mongoUri, firmId, apply } = validateMigrationConfig(env);
  let failed = false;
  let summary = { contactCandidates: 0, customerCandidates: 0, doctorsToCreate: 0, existingDoctors: 0, visitsToRepoint: 0, skipped: 0 };

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const visits = await MrVisit.find({ doctorId: { $ne: null } }).lean();
      const contactIds = new Set();
      const customerIds = new Set();
      for (const visit of visits) {
        if (visit.doctorRefModel === 'Customer') customerIds.add(String(visit.doctorId));
        else if (visit.doctorRefModel === 'Contact') contactIds.add(String(visit.doctorId));
      }

      const contactFilter = { $or: [{ _id: { $in: [...contactIds] } }, ...doctorFieldFilter] };
      const customerFilter = { $or: [{ _id: { $in: [...customerIds] } }, ...doctorFieldFilter] };
      const [contacts, customers] = await Promise.all([
        Contact.find(contactFilter).lean(),
        Customer.find(customerFilter).lean()
      ]);
      summary.contactCandidates = contacts.length;
      summary.customerCandidates = customers.length;
      summary.skipped = [...contacts, ...customers].filter(record => !hasName(record)).length;

      const contactMap = new Map();
      const customerMap = new Map();
      for (const [records, source, map, linkField] of [
        [contacts, 'Contact', contactMap, 'linkedContactId'],
        [customers, 'Customer', customerMap, 'linkedCustomerId']
      ]) {
        for (const record of records) {
          if (!hasName(record)) continue;
          const existing = await Doctor.findOne({ [linkField]: record._id }).select('_id').lean();
          if (existing) {
            map.set(String(record._id), existing._id);
            summary.existingDoctors += 1;
            continue;
          }
          summary.doctorsToCreate += 1;
          if (apply) {
            const created = await Doctor.create(doctorPayload(record, source));
            map.set(String(record._id), created._id);
          }
        }
      }

      if (apply) {
        for (const visit of visits) {
          const map = visit.doctorRefModel === 'Customer' ? customerMap : contactMap;
          const doctorId = map.get(String(visit.doctorId));
          if (!doctorId) continue;
          await MrVisit.updateOne(
            { _id: visit._id },
            { $set: { doctorId, doctorRefModel: 'Doctor' } }
          );
          summary.visitsToRepoint += 1;
        }
      } else {
        for (const visit of visits) {
          const map = visit.doctorRefModel === 'Customer' ? customerMap : contactMap;
          if (map.has(String(visit.doctorId)) || [...contacts, ...customers].some(record => String(record._id) === String(visit.doctorId) && hasName(record))) {
            summary.visitsToRepoint += 1;
          }
        }
      }

      console.log(`${apply ? 'Doctor migration applied' : 'Doctor migration dry run'} for firm ${firm._id}:`, summary);
      if (!apply) console.log('No records changed. Review counts, then set MIGRATE_DOCTORS_APPLY=YES and MIGRATE_DOCTORS_CONFIRM=YES to apply.');
    });
  } catch (error) {
    failed = true;
    console.error('Doctor migration failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); }
      catch (error) { failed = true; console.error('Database disconnect failed:', error.message); }
    }
  }
  if (failed) process.exitCode = 1;
  return summary;
}

if (require.main === module) migrateDoctors();
module.exports = { migrateDoctors, validateMigrationConfig, doctorPayload };
