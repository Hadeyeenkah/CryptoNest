// scripts/deleteUsersWithNullEmail.js
const mongoose = require('mongoose');
require('dotenv').config(); // Load your MongoDB URI from .env

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cypto';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const result = await mongoose.connection.db.collection('users').deleteMany({ email: null });
    console.log(`🗑️ Deleted ${result.deletedCount} user(s) with null email`);

    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
