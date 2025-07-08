const Investment = require('../models/Investment');
const User = require('../models/User');

const investmentController = {
  // Get all investments for a user
  getUserInvestments: async (req, res) => {
    try {
      const { userId } = req.query;
      const filter = userId ? { userId, isActive: true } : { isActive: true };
      
      const investments = await Investment.find(filter)
        .populate('userId', 'username email firstName lastName')
        .sort({ createdAt: -1 });
      
      res.json(investments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get investment by ID
  getInvestmentById: async (req, res) => {
    try {
      const investment = await Investment.findById(req.params.id)
        .populate('userId', 'username email firstName lastName');
      
      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }
      
      res.json(investment);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Create new investment with tiered returns
  createInvestment: async (req, res) => {
    try {
      const { amount, userId } = req.body;

      // Validate investment amount and set daily return rates
      let dailyReturn = 0;
      if (amount >= 500 && amount < 1000) {
        dailyReturn = 0.10;
      } else if (amount >= 1000 && amount < 5000) {
        dailyReturn = 0.20;
      } else if (amount >= 5000 && amount <= 10000) {
        dailyReturn = 0.35;
      } else {
        return res.status(400).json({ 
          error: 'Invalid investment range. Amount must be between $500 and $10,000' 
        });
      }

      // Check if user has sufficient balance
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.totalBalance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Create investment with approval required
      const investment = new Investment({
        userId,
        symbol: 'INVESTMENT',
        name: `Fixed Return Investment - ${dailyReturn}% Daily`,
        quantity: 1,
        purchasePrice: amount,
        currentPrice: amount,
        totalValue: amount,
        dailyReturn,
        approved: false,
        profit: 0,
        investmentType: 'other',
        isActive: true
      });

      await investment.save();

      // Deduct amount from user balance (will be held until approved)
      user.totalBalance -= amount;
      await user.save();

      res.status(201).json({ 
        message: 'Investment submitted successfully and is pending admin approval',
        investment: {
          id: investment._id,
          amount,
          dailyReturn,
          approved: false,
          status: 'pending'
        }
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Approve investment (admin only)
  approveInvestment: async (req, res) => {
    try {
      const investment = await Investment.findById(req.params.id);
      
      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }

      if (investment.approved) {
        return res.status(400).json({ error: 'Investment already approved' });
      }

      // Approve the investment
      investment.approved = true;
      investment.startDate = new Date();
      await investment.save();

      // Update user's portfolio value
      await updateUserPortfolio(investment.userId);

      res.json({ 
        message: 'Investment approved successfully',
        investment 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Reject investment (admin only)
  rejectInvestment: async (req, res) => {
    try {
      const investment = await Investment.findById(req.params.id);
      
      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }

      if (investment.approved) {
        return res.status(400).json({ error: 'Cannot reject approved investment' });
      }

      // Return money to user
      const user = await User.findById(investment.userId);
      user.totalBalance += investment.purchasePrice;
      await user.save();

      // Mark investment as inactive
      investment.isActive = false;
      await investment.save();

      res.json({ 
        message: 'Investment rejected and funds returned to user',
        refundAmount: investment.purchasePrice
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get pending investments (admin only)
  getPendingInvestments: async (req, res) => {
    try {
      const pendingInvestments = await Investment.find({ 
        approved: false, 
        isActive: true 
      })
      .populate('userId', 'username email firstName lastName')
      .sort({ createdAt: -1 });

      res.json(pendingInvestments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Calculate and apply daily profits
  calculateDailyProfits: async (req, res) => {
    try {
      const approvedInvestments = await Investment.find({ 
        approved: true, 
        isActive: true 
      });

      const updates = [];
      
      for (const investment of approvedInvestments) {
        const dailyProfit = investment.purchasePrice * (investment.dailyReturn / 100);
        investment.profit += dailyProfit;
        investment.currentPrice = investment.purchasePrice + investment.profit;
        investment.totalValue = investment.currentPrice;
        
        updates.push(investment.save());
        
        // Update user's portfolio value
        await updateUserPortfolio(investment.userId);
      }

      await Promise.all(updates);

      res.json({ 
        message: 'Daily profits calculated and applied',
        processedInvestments: approvedInvestments.length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update investment
  updateInvestment: async (req, res) => {
    try {
      const investment = await Investment.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }

      // Update user's portfolio value
      await updateUserPortfolio(investment.userId);
      
      res.json(investment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Delete investment (soft delete)
  deleteInvestment: async (req, res) => {
    try {
      const investment = await Investment.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      );

      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }

      // Update user's portfolio value
      await updateUserPortfolio(investment.userId);
      
      res.json({ message: 'Investment deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update investment prices (for batch price updates)
  updatePrices: async (req, res) => {
    try {
      const { priceUpdates } = req.body; // Array of {symbol, newPrice}
      
      const updatePromises = priceUpdates.map(async ({ symbol, newPrice }) => {
        return Investment.updateMany(
          { symbol, isActive: true },
          { currentPrice: newPrice }
        );
      });

      await Promise.all(updatePromises);
      
      // Update all affected users' portfolio values
      const affectedInvestments = await Investment.find({
        symbol: { $in: priceUpdates.map(u => u.symbol) },
        isActive: true
      });
      
      const uniqueUserIds = [...new Set(affectedInvestments.map(inv => inv.userId.toString()))];
      
      const portfolioUpdatePromises = uniqueUserIds.map(userId => 
        updateUserPortfolio(userId)
      );
      
      await Promise.all(portfolioUpdatePromises);
      
      res.json({ message: 'Prices updated successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// Helper function to update user's portfolio value
async function updateUserPortfolio(userId) {
  try {
    const investments = await Investment.find({ userId, isActive: true });
    const portfolioValue = investments.reduce((sum, inv) => sum + inv.totalValue, 0);
    
    await User.findByIdAndUpdate(userId, { portfolioValue });
  } catch (error) {
    console.error('Error updating user portfolio:', error);
  }
}

module.exports = investmentController;