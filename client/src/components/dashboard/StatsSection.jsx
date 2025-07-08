// src/components/dashboard/StatsSection.jsx
import React from 'react';
import StatCard from './StatCard';
import { BarChart2, TrendingUp, Zap, Clock } from 'lucide-react'; // Import Lucide icons here
import { formatCurrency } from '../../utils/formatters'; // Import formatter

const StatsSection = ({ accountData, dailyInterest, loading }) => (
    <section className="stats-section">
        <div className="stats-grid">
            <StatCard
                title="Total Balance"
                value={formatCurrency(accountData.balance)}
                icon={BarChart2}
                loading={loading}
                gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            />
            <StatCard
                title="Total Investment"
                value={formatCurrency(accountData.totalInvestment)}
                icon={TrendingUp}
                loading={loading}
                gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
            />
            <StatCard
                title="Total Interest"
                value={formatCurrency(accountData.totalInterest)}
                icon={Zap}
                loading={loading}
                gradient="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)"
            />
            <StatCard
                title="Daily Earning"
                value={formatCurrency(dailyInterest)}
                icon={Clock}
                loading={loading}
                gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
            />
        </div>
    </section>
);

export default StatsSection;