// src/constants/investmentPlans.js

export const INVESTMENT_PLANS = [
    {
        id: 'basic',
        name: 'Basic Plan',
        min: 500,
        max: 999,
        minFormatted: '$500',
        maxFormatted: '$999',
        duration: '15 Days',
        interestRate: 10, // Updated to 10%
        buttonText: 'Choose Plan',
        features: ['Standard market access', 'Email support'],
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
        id: 'gold',
        name: 'Gold Plan',
        min: 1000,
        max: 4999,
        minFormatted: '$1,000',
        maxFormatted: '$4,999',
        duration: '20 Days',
        interestRate: 20, // Updated to 20%
        buttonText: 'Upgrade Now',
        features: ['Priority market access', 'Performance analytics'],
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        recommended: true
    },
    {
        id: 'platinum',
        name: 'Platinum Plan',
        min: 5000,
        max: Infinity,
        minFormatted: '$5,000+',
        maxFormatted: 'Unlimited',
        duration: '30 Days',
        interestRate: 20, // Updated to 20%
        buttonText: 'Upgrade Now',
        features: ['Dedicated account manager', 'API access'],
        gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    }
];