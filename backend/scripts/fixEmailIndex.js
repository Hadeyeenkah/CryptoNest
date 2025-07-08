const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/cypto'; // Double-check DB name!

(async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    const collection = mongoose.connection.db.collection('users');

    const indexes = await collection.indexes();
    console.log('🔍 Existing indexes:', indexes);

    // Attempt to drop the old index
    try {
      await collection.dropIndex('email_1');
      console.log('🧹 Dropped old email index');
    } catch (e) {
      console.warn('⚠️ Could not drop email index (might already be gone):', e.message);
    }

    // Recreate correct index
    await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
    console.log('✅ Created new sparse+unique email index');

    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
