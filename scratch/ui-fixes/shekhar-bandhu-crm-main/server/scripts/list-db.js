require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function listDb() {
  try {
    await mongoose.connect(MONGODB_URI);
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in Database:');
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} documents`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

listDb();
