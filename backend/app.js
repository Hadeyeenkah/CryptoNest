const express = require('express');
const app = express();
const authRoutes = require('./routes/authRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes');
const transactionRoutes = require('./routes/transactionRoutes');



app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/transactions', transactionRoutes);

const cors = require('cors');
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));


module.exports = app;
