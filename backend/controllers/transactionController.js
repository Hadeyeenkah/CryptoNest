const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Investment = require('../models/Investment');

const transactionController = {
  // Get all transactions
  getAllTransactions: async (req, res) => {
    try {
      const { userId, type, page = 1, limit = 20 } = req.query;
      
      const filter = {};
      if (userId) filter.userId = userId;
      if (type) filter.type = type;
      
      const skip = (page - 1) * limit;
      
      const [transactions, total] = await Promise.all([
        Transaction.find(filter)
          .populate('userId', 'username email firstName lastName')
          .populate('investmentId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Transaction.countDocuments(filter)
      ]);
      
      res.json({
        transactions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get transaction by ID
  getTransactionById: async (req, res) => {
    try {
      const transaction = await Transaction.findById(req.params.id)
        .populate('userId', 'username email firstName lastName')
        .populate('investmentId');
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Create new transaction
  createTransaction: async (req, res) => {
    try {
      const transaction = new Transaction(req.body);
      
      // Process the transaction based on type
      switch (transaction.type) {
        case 'buy':
          await processBuyTransaction(transaction);
          break;
        case 'sell':
          await processSellTransaction(transaction);
          break;
        case 'deposit':
          await processDepositTransaction(transaction);
          break;
        case 'withdrawal':
          await processWithdrawalTransaction(transaction);
          break;
      }
      
      await transaction.save();
      res.status(201).json(transaction);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Update transaction
  updateTransaction: async (req, res) => {
    try {
      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Delete transaction
  deleteTransaction: async (req, res) => {
    try {
      const transaction = await Transaction.findByIdAndDelete(req.params.id);

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// Helper functions for processing different transaction types
async function processBuyTransaction(transaction) {
  const { userId, symbol, quantity, price } = transaction;
  
  // Check if user has enough balance
  const user = await User.findById(userId);
  const totalCost = quantity * price + (transaction.fees || 0);
  
  if (user.totalBalance < totalCost) {
    throw new Error('Insufficient balance');
  }
  
  // Update user balance
  user.totalBalance -= totalCost;
  await user.save();
  
  // Update or create investment
  let investment = await Investment.findOne({ userId, symbol, isActive: true });
  
  if (investment) {
    // Update existing investment
    const newQuantity = investment.quantity + quantity;
    const newPurchasePrice = ((investment.quantity * investment.purchasePrice) + (quantity * price)) / newQuantity;
    
    investment.quantity = newQuantity;
    investment.purchasePrice = newPurchasePrice;
    investment.currentPrice = price;
    await investment.save();
    
    transaction.investmentId = investment._id;
  } else {
    // Create new investment
    investment = new Investment({
      userId,
      symbol,
      name: transaction.description || symbol,
      quantity,
      purchasePrice: price,
      currentPrice: price,
      totalValue: quantity * price
    });
    await investment.save();
    
    transaction.investmentId = investment._id;
  }
}

async function processSellTransaction(transaction) {
  const { userId, symbol, quantity, price } = transaction;
  
  // Find investment
  const investment = await Investment.findOne({ userId, symbol, isActive: true });
  
  if (!investment || investment.quantity < quantity) {
    throw new Error('Insufficient shares to sell');
  }
  
  // Update investment
  investment.quantity -= quantity;
  if (investment.quantity === 0) {
    investment.isActive = false;
  }
  await investment.save();
  
  // Update user balance
  const proceeds = quantity * price - (transaction.fees || 0);
  await User.findByIdAndUpdate(userId, { $inc: { totalBalance: proceeds } });
  
  transaction.investmentId = investment._id;
}

async function processDepositTransaction(transaction) {
  const { userId, totalAmount } = transaction;
  await User.findByIdAndUpdate(userId, { $inc: { totalBalance: totalAmount } });
}

async function processWithdrawalTransaction(transaction) {
  const { userId, totalAmount } = transaction;
  
  const user = await User.findById(userId);
  if (user.totalBalance < totalAmount) {
    throw new Error('Insufficient balance for withdrawal');
  }
  
  await User.findByIdAndUpdate(userId, { $inc: { totalBalance: -totalAmount } });
}

module.exports = transactionController;