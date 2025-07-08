// src/components/dashboard/TransactionHistorySection.jsx
import React from 'react';
import Card from '../shared/Card';
import TransactionList from './TransactionList';


const TransactionHistorySection = ({ transactions, loading, error }) => (
    <section className="transaction-history-section">
        <div className="section-header">
            <h2>Transaction History</h2>
            <p>Track all your deposits, withdrawals, and interest earnings.</p>
        </div>
        <Card className="transaction-list-card">
            <div className="transaction-list-header">
                <h3>Recent Activity</h3>
                <span className="transaction-count">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </span>
            </div>
            <ul className="transaction-list">
                <TransactionList transactions={transactions} loading={loading} error={error} />
            </ul>
        </Card>
    </section>
);

export default TransactionHistorySection;
