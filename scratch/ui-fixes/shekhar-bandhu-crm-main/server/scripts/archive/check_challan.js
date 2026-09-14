const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const StockMovement = require('./models/Order'); // wait, import correct models
const Order = require('./models/Order');
const SM = require('./models/StockMovement');
const Dispatch = require('./models/Dispatch');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // Let's find StockMovement with docNo containing '6' or similar
  const smList = await SM.find({}).lean();
  console.log('ALL CHALLANS IN DB:');
  smList.forEach(sm => {
    console.log(`- ID: ${sm._id}, docNo: ${sm.docNo}, type: ${sm.type}, sourceDocId: ${sm.sourceDocId}, status: ${sm.status}`);
  });

  const matchingChallan = smList.find(s => s.docNo.includes('6') || s.docNo.endsWith('6') || s.docNo.includes('006'));
  if (matchingChallan) {
    console.log('\nMATCHING CHALLAN DETAILS:', JSON.stringify(matchingChallan, null, 2));
    
    // Check if there is a dispatch record for this challan
    const dispatch = await Dispatch.findOne({ challanId: matchingChallan._id }).lean();
    console.log('\nDISPATCH FOR THIS CHALLAN:', JSON.stringify(dispatch, null, 2));
  } else {
    console.log('\nNo Challan No 6 found.');
  }

  await mongoose.disconnect();
}

run().catch(console.error);
