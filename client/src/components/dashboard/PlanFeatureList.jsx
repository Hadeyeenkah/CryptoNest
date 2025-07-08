// src/components/dashboard/PlanFeatureList.jsx
import React from 'react';
import { Check } from 'lucide-react';

const PlanFeatureList = ({ features }) => (
    <ul className="plan-features">
        {features.map((feature, index) => (
            <li key={index}>
                <Check size={16} />
                {feature}
            </li>
        ))}
    </ul>
);

export default PlanFeatureList;