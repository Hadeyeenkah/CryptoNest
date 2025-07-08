const express = require('express');
const investmentController = require('../controllers/investmentController');

const router = express.Router();

router.get('/', investmentController.getUserInvestments);
router.get('/pending', investmentController.getPendingInvestments);
router.get('/:id', investmentController.getInvestmentById);
router.post('/', investmentController.createInvestment);
router.put('/:id', investmentController.updateInvestment);
router.delete('/:id', investmentController.deleteInvestment);
router.patch('/prices', investmentController.updatePrices);
router.patch('/:id/approve', investmentController.approveInvestment);
router.patch('/:id/reject', investmentController.rejectInvestment);
router.post('/calculate-profits', investmentController.calculateDailyProfits);

module.exports = router;