// src/components/shared/TransactionIcon.jsx
import React from 'react';
import { TrendingUp, TrendingDown, Zap, Clock } from 'lucide-react';

const TransactionIcon = ({ type }) => {
    const getIconConfig = () => {
        switch (type) {
            case 'deposit':
                return { Icon: TrendingUp, className: 'icon-positive' };
            case 'withdrawal':
                return { Icon: TrendingDown, className: 'icon-negative' };
            case 'interest':
                return { Icon: Zap, className: 'icon-interest' };
            default:
                return { Icon: Clock, className: 'icon-neutral' };
        }
    };

    const { Icon, className } = getIconConfig();

    return (
        <div className={`transaction-icon-wrapper ${className}`}>
            <Icon strokeWidth={2} size={20} />
        </div>
    );
};

export default TransactionIcon;