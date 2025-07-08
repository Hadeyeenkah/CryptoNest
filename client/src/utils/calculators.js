// src/utils/calculators.js
import { INVESTMENT_PLANS } from '../constants/investmentPlans';

export const calculateDailyInterest = (investment) => {
    const activePlan = INVESTMENT_PLANS.find(
        plan => investment >= plan.min && investment <= plan.max
    );
    // Uses the interestRate as a whole number (e.g., 10, 20) and converts it to a decimal
    return activePlan ? investment * (activePlan.interestRate / 100) : 0;
};

export const getCurrentPlan = (totalInvestment) => {
    return INVESTMENT_PLANS.find(
        plan => totalInvestment >= plan.min && totalInvestment <= plan.max
    ) || INVESTMENT_PLANS[0];
};