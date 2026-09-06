require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Contact = require('../models/Contact');
const Customer = require('../models/Customer');
const MrVisit = require('../models/MrVisit');

async function migrateDoctors() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment or .env');
    process.exit(1);
  }

  try {
    console.log('🔌 Connecting to MongoDB for Doctor migration...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Gather all MrVisit records referencing Contact/Customer
    const visits = await MrVisit.find({ doctorId: { $ne: null } }).lean();
    const referencedContactIds = new Set();
    const referencedCustomerIds = new Set();

    visits.forEach(v => {
      if (v.doctorId) {
        if (v.doctorRefModel === 'Customer') {
          referencedCustomerIds.add(v.doctorId.toString());
        } else {
          referencedContactIds.add(v.doctorId.toString());
        }
      }
    });

    console.log(`🔍 Found ${visits.length} MrVisit records with doctorId (Contacts: ${referencedContactIds.size}, Customers: ${referencedCustomerIds.size})`);

    // 2. Query Contacts & Customers with doctor fields or visit references
    const doctorFieldFilter = [
      { category: { $in: ['A', 'B', 'C'] } },
      { specialty: { $ne: '', $exists: true } },
      { birthday: { $ne: null } },
      { anniversary: { $ne: null } },
      { preferredTime: { $ne: '', $exists: true } },
      { preferredVisitDay: { $ne: '', $exists: true } },
      { monthlySampleQuota: { $ne: null } },
    ];

    const contactFilter = {
      $or: [
        { _id: { $in: Array.from(referencedContactIds) } },
        ...doctorFieldFilter
      ]
    };

    const customerFilter = {
      $or: [
        { _id: { $in: Array.from(referencedCustomerIds) } },
        ...doctorFieldFilter
      ]
    };

    const [contactsToMigrate, customersToMigrate] = await Promise.all([
      Contact.find(contactFilter).lean(),
      Customer.find(customerFilter).lean(),
    ]);

    console.log(`📋 Candidates for migration: ${contactsToMigrate.length} Contacts, ${customersToMigrate.length} Customers.`);

    let createdCount = 0;
    let existingCount = 0;
    const skippedList = [];

    // Map of old Contact/Customer ID -> new Doctor _id
    const contactToDoctorMap = new Map();
    const customerToDoctorMap = new Map();

    // 3. Migrate Contacts to Doctor records
    for (const c of contactsToMigrate) {
      if (!c.name || !c.name.trim()) {
        skippedList.push({ type: 'Contact', id: c._id, name: c.name || '(unnamed)', reason: 'Missing or empty name' });
        continue;
      }

      let doctor = await Doctor.findOne({ linkedContactId: c._id });
      if (doctor) {
        existingCount++;
        contactToDoctorMap.set(c._id.toString(), doctor._id);
      } else {
        doctor = await Doctor.create({
          name: c.name.trim(),
          clinicName: (c.company || '').trim(),
          specialization: (c.specialty || '').trim(),
          category: c.category || '',
          phone: c.phone || '',
          email: c.email || '',
          address: '',
          city: (c.city || '').trim(),
          pincode: '',
          latitude: c.latitude,
          longitude: c.longitude,
          birthday: c.birthday || null,
          anniversary: c.anniversary || null,
          preferredTime: (c.preferredTime || '').trim(),
          preferredVisitDay: c.preferredVisitDay || '',
          monthlySampleQuota: c.monthlySampleQuota || null,
          assignedMrId: c.assignedMrId || null,
          areaName: (c.areaName || '').trim(),
          linkedContactId: c._id,
          linkedCustomerId: null,
          notes: '',
        });
        createdCount++;
        contactToDoctorMap.set(c._id.toString(), doctor._id);
      }
    }

    // 4. Migrate Customers to Doctor records
    for (const cust of customersToMigrate) {
      if (!cust.name || !cust.name.trim()) {
        skippedList.push({ type: 'Customer', id: cust._id, name: cust.name || '(unnamed)', reason: 'Missing or empty name' });
        continue;
      }

      let doctor = await Doctor.findOne({ linkedCustomerId: cust._id });
      if (doctor) {
        existingCount++;
        customerToDoctorMap.set(cust._id.toString(), doctor._id);
      } else {
        const street = cust.billingAddress ? (cust.billingAddress.street || '') : '';
        const city = cust.billingAddress && cust.billingAddress.city ? cust.billingAddress.city : (cust.city || '');
        const pin = cust.billingAddress ? (cust.billingAddress.pin || '') : '';

        doctor = await Doctor.create({
          name: cust.name.trim(),
          clinicName: (cust.company || '').trim(),
          specialization: (cust.specialty || '').trim(),
          category: cust.category || '',
          phone: cust.phone || '',
          email: cust.email || '',
          address: street.trim(),
          city: city.trim(),
          pincode: pin.trim(),
          latitude: cust.latitude,
          longitude: cust.longitude,
          birthday: cust.birthday || null,
          anniversary: cust.anniversary || null,
          preferredTime: (cust.preferredTime || '').trim(),
          preferredVisitDay: cust.preferredVisitDay || '',
          monthlySampleQuota: cust.monthlySampleQuota || null,
          assignedMrId: cust.assignedMrId || null,
          areaName: (cust.areaName || '').trim(),
          linkedContactId: null,
          linkedCustomerId: cust._id,
          notes: '',
        });
        createdCount++;
        customerToDoctorMap.set(cust._id.toString(), doctor._id);
      }
    }

    // 5. Repoint MrVisit records
    let repointedVisitsCount = 0;
    for (const v of visits) {
      const isCustomerRef = v.doctorRefModel === 'Customer';
      const targetMap = isCustomerRef ? customerToDoctorMap : contactToDoctorMap;
      const oldIdStr = v.doctorId ? v.doctorId.toString() : '';

      const newDoctorId = targetMap.get(oldIdStr);
      if (newDoctorId) {
        await MrVisit.findByIdAndUpdate(v._id, {
          doctorId: newDoctorId,
          doctorRefModel: 'Doctor'
        });
        repointedVisitsCount++;
      }
    }

    // 6. Log Summary
    console.log('\n=================== MIGRATION SUMMARY ===================');
    console.log(`✅ Doctor records created       : ${createdCount}`);
    console.log(`ℹ️ Doctor records already existed: ${existingCount}`);
    console.log(`🔄 MrVisit records repointed     : ${repointedVisitsCount}`);
    console.log(`⚠️ Skipped records               : ${skippedList.length}`);
    if (skippedList.length > 0) {
      console.log('Skipped details:');
      skippedList.forEach(item => {
        console.log(`  - [${item.type}] ${item.name} (_id: ${item.id}): ${item.reason}`);
      });
    }
    console.log('=========================================================\n');

    return {
      createdCount,
      existingCount,
      repointedVisitsCount,
      skippedList
    };

  } catch (err) {
    console.error('❌ Doctor migration failed:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

if (require.main === module) {
  migrateDoctors().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateDoctors };
