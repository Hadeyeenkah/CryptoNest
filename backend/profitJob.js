// profitJob.js

const io = require('socket.io-client');
const cron = require('node-cron');
const Investment = require('./models/Investment');

// Define user ID early
const userId = '12345';

// Initialize socket before using it
const socket = io('http://localhost:5000');

// Emit join event after socket is initialized
socket.emit('join', userId);

// Optional: listen for server-side events
socket.on('profitUpdate', data => {
  console.log('💰 Profit updated:', data);
});

// Schedule daily profit calculation at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const investments = await Investment.find({ approved: true });

    for (const inv of investments) {
      const now = new Date();
      const last = new Date(inv.lastProfitDate || now);
      const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24)); // days

      if (diff >= 1) {
        inv.profit += inv.amount * inv.dailyReturn * diff;
        inv.lastProfitDate = now;
        await inv.save();
      }
    }

    console.log('✅ Daily profits calculated');
  } catch (err) {
    console.error('❌ Error calculating profits:', err);
  }
});
