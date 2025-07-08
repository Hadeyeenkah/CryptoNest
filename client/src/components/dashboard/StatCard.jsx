// src/components/dashboard/StatCard.jsx
import React from 'react';
import Card from '../shared/Card';
import LoadingShimmer from '../shared/LoadingShimmer';
// Lucide icons are passed as props, so no need to import them here

const StatCard = ({ title, value, icon: Icon, loading = false, gradient }) => (
    <Card className="stat-card">
        <div className="stat-icon-wrapper" style={{ background: gradient }}>
            <Icon strokeWidth={2} size={32} /> {/* Increased icon size */}
        </div>
        <div className="stat-content">
            <p className="stat-title">{title}</p>
            {loading ? (
                <LoadingShimmer />
            ) : (
                <p className="stat-value">{value}</p>
            )}
        </div>
    </Card>
);

export default StatCard;