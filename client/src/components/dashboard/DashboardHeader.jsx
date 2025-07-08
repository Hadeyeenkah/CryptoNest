// src/components/dashboard/DashboardHeader.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowDown } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters'; // Import formatter

const DashboardHeader = ({ firstName, onWithdraw, balance }) => (
    <header className="dashboard-header">
        <div className="welcome-message">
            <h1>Welcome back, {firstName}</h1>
            <p>Here's a summary of your investment account.</p>
            <div className="quick-balance">
                <span>Available Balance: </span>
                <strong>{formatCurrency(balance)}</strong>
            </div>
        </div>
        <div className="header-actions">
            <Link to="/deposit" className="action-button primary">
                <Plus size={18} />
                Deposit
            </Link>
            <button onClick={onWithdraw} className="action-button secondary">
                <ArrowDown size={18} />
                Withdraw
            </button>
        </div>
    </header>
);

export default DashboardHeader;
