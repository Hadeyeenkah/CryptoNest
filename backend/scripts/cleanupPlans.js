// scripts/cleanupPlans.js
const mongoose = require('mongoose');
require('dotenv').config();

const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cryptonest';

(async () => {
  try {
    await mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('🧹 Connected to MongoDB...');

    const result = await mongoose.connection.db.dropCollection('plans');
    console.log('✅ Plans collection dropped:', result);
  } catch (err) {
    console.error('⚠️ Error dropping plans collection:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
})();
