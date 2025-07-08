// src/components/dashboard/TransactionItem.jsx
import React from 'react';
import TransactionIcon from '../shared/TransactionIcon'; // Import shared icon component
import { formatCurrency, formatTransactionDate } from '../../utils/formatters'; // Import formatters

const TransactionItem = ({ transaction }) => {
    const isPositive = transaction.type === 'deposit' || transaction.type === 'interest';
    const amountClass = isPositive ? 'amount-positive' : 'amount-negative';
    const amountPrefix = isPositive ? '+' : '-';

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed': return 'status-completed';
            case 'pending': return 'status-pending';
            case 'failed': return 'status-failed';
            default: return 'status-pending';
        }
    };

    return (
        <li className="transaction-item">
            <TransactionIcon type={transaction.type} />

            <div className="transaction-details">
                <p className="transaction-type">
                    {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                </p>
                <p className="transaction-date">
                    {formatTransactionDate(transaction.date || transaction.createdAt)}
                </p>
                {transaction.description && (
                    <p className="transaction-description">{transaction.description}</p>
                )}
            </div>

            <div className="transaction-status-amount">
                <p className={`transaction-amount ${amountClass}`}>
                    {amountPrefix} {formatCurrency(Math.abs(transaction.amount))}
                </p>
                <span className={`transaction-status ${getStatusColor(transaction.status)}`}>
                    {transaction.status || 'pending'}
                </span>
            </div>
        </li>
    );
};

export default TransactionItem;