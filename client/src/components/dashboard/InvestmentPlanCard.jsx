// src/components/dashboard/InvestmentPlanCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import Card from '../shared/Card';
import PlanFeatureList from './PlanFeatureList';

const InvestmentPlanCard = ({ plan, currentInvestment, onSelectPlan }) => {
    const isActive = currentInvestment >= plan.min && currentInvestment <= plan.max;

    return (
        <Card className={`investment-plan-card ${isActive ? 'active' : ''}`}>
            {plan.recommended && !isActive && (
                <div className="recommendation-badge">Recommended</div>
            )}

            <div className="plan-header">
                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-range">{plan.duration} Term</p>
            </div>

            <p className="plan-investment-range">
                {plan.minFormatted} - {plan.maxFormatted}
            </p>

            <p className="plan-interest-rate">
                Up to <span>{plan.interestRate}%</span> daily interest
            </p>

            <PlanFeatureList features={plan.features} />

            {isActive ? (
                <button className="plan-button current" disabled>
                    <Check size={16} />
                    Current Plan
                </button>
            ) : (
                <Link to="/deposit" className="plan-button" onClick={() => onSelectPlan(plan)}>
                    {plan.buttonText}
                    <ArrowRight size={16} />
                </Link>
            )}
        </Card>
    );
};

export default InvestmentPlanCard;