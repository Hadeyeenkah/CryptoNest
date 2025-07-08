// src/components/dashboard/TransactionList.jsx
import React from 'react';
import TransactionItem from './TransactionItem';
import { AlertTriangle, Clock } from 'lucide-react'; // Import Lucide icons

const TransactionList = ({ transactions, loading, error }) => {
    if (loading && transactions.length === 0) {
        return (
            <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Loading transactions...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="empty-state error-state">
                <AlertTriangle size={48} color="#f5576c" />
                <p>Error loading transactions</p>
                <span>{error}</span>
            </div>
        );
    }

    if (!loading && transactions.length === 0) {
        return (
            <div className="empty-state">
                <Clock size={48} />
                <p>No transactions yet</p>
                <span>Your transaction history will appear here</span>
            </div>
        );
    }

    return transactions.map(transaction => (
        <TransactionItem key={transaction.id} transaction={transaction} />
    ));
};

export default TransactionList;