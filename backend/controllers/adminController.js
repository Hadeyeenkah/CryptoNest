// controllers/adminController.js
const Investment = require('../models/Investment');

exports.approveInvestment = async (req, res) => {
  const { id } = req.params;

  const investment = await Investment.findById(id);
  if (!investment) return res.status(404).json({ error: 'Investment not found' });

  investment.approved = true;
  investment.lastProfitDate = new Date();
  await investment.save();

  res.json({ message: 'Investment approved' });
};
