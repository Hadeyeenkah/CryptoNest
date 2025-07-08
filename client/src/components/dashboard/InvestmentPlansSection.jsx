// src/components/dashboard/InvestmentPlansSection.jsx
import React from 'react';
import InvestmentPlanCard from './InvestmentPlanCard';
import { INVESTMENT_PLANS } from '../../constants/investmentPlans'; // Import constants

const InvestmentPlansSection = ({ currentInvestment, onSelectPlan }) => (
    <section className="investment-plans-section">
        <div className="section-header">
            <h2>Investment Plans</h2>
            <p>Choose the perfect plan to maximize your daily earnings potential.</p>
        </div>
        <div className="plans-grid">
            {INVESTMENT_PLANS.map(plan => (
                <InvestmentPlanCard
                    key={plan.id}
                    plan={plan}
                    currentInvestment={currentInvestment}
                    onSelectPlan={onSelectPlan}
                />
            ))}
        </div>
    </section>
);

export default InvestmentPlansSection;