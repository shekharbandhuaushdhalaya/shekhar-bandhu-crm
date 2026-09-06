require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');

const ORIGINAL_37_HERBS = [
  'ASHWAGANDHA',
  'TULSI',
  'SHATAVARI',
  'GUDUCHI',
  'AMALAKI',
  'HARITAKI',
  'BIBHITAKI',
  'YASHTIMADHU',
  'PIPPALI',
  'MARICHA',
  'SHUNTHI',
  'GUGGULU',
  'HARIDRA',
  'MANJISTHA',
  'BHRINGRAJ',
  'ARJUNA',
  'JATAMANSI',
  'SHALLAKI',
  'SHILAJIT',
  'SWARNA (GOLD)',
  'ABHRAKA (MICA)',
  'GANDHAKA (SULFUR)',
  'MADHU (HONEY)',
  'SHANKHA (CONCH SHELL)',
  'VATSANABHA',
  'BHALLATAKA',
  'DHATAKI',
  'DRAKSHA',
  'MUSTA',
  'KATUKA',
  'TIL OIL',
  'MAIDA LAKDI',
  'MAHUA',
  'VARUNA',
  'KANKOLA',
  'USHEERA',
  'TALISPATRA'
];

async function backfillPharmacopoeiaVerification() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm';

  try {
    console.log('🔌 Connecting to MongoDB for Pharmacopoeia verification backfill...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Backfill original 37 entries as verified: true, source: 'manual'
    const resVerified = await PharmacopoeiaEntry.updateMany(
      { ayurvedicName: { $in: ORIGINAL_37_HERBS } },
      { $set: { verified: true, source: 'manual' } }
    );
    console.log(`✅ Set verified: true (source: 'manual') on ${resVerified.modifiedCount} original entries (matched: ${resVerified.matchedCount})`);

    // 2. Backfill unverified entries (entries not in original 37 and not already manually verified)
    const resUnverified = await PharmacopoeiaEntry.updateMany(
      {
        ayurvedicName: { $nin: ORIGINAL_37_HERBS },
        $or: [
          { verified: false },
          { verified: { $exists: false } }
        ]
      },
      { $set: { verified: false, source: 'AI-generated' } }
    );
    console.log(`⚠️ Set verified: false (source: 'AI-generated') on ${resUnverified.modifiedCount} unverified entries (matched: ${resUnverified.matchedCount})`);

    const verifiedTotal = await PharmacopoeiaEntry.countDocuments({ verified: true });
    const unverifiedTotal = await PharmacopoeiaEntry.countDocuments({ verified: false });

    console.log('\n=================== BACKFILL SUMMARY ===================');
    console.log(` Verified entries (Official API/AFI) : ${verifiedTotal}`);
    console.log(` Pending review (AI-generated)       : ${unverifiedTotal}`);
    console.log('=========================================================\n');

    return { verifiedTotal, unverifiedTotal };

  } catch (err) {
    console.error('❌ Pharmacopoeia backfill failed:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

if (require.main === module) {
  backfillPharmacopoeiaVerification().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { backfillPharmacopoeiaVerification, ORIGINAL_37_HERBS };
