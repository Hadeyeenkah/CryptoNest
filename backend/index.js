const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const authRoutes = require('./routes/auth');  // Import the auth routes

// Initialize dotenv for environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());  // Enable Cross-Origin Requests
app.use(express.json());  // Parse incoming JSON data

// Use the auth routes for all /api/auth paths
app.use('/api/auth', authRoutes);

// Server Setup
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/yourdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));
