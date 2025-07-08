import React from 'react';
import './UserCard.css'; // Make sure to import the CSS file

const UserCard = ({ user, onEdit, onDelete }) => {
  return (
    <div className="user-card">
      <h2 className="user-name">{user.fullName}</h2>
      <p><strong>Username:</strong> {user.username}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Balance:</strong> ${user.balance?.toFixed(2)}</p>
      <p><strong>Investment Plan:</strong> {user.investmentPlan}</p>
      <p><strong>Role:</strong> {user.role}</p>
      <p className={`status ${user.isActive ? 'active' : 'inactive'}`}>
        {user.isActive ? 'Active' : 'Inactive'}
      </p>
      <div className="user-actions">
        <button className="edit-btn" onClick={() => onEdit(user)}>Edit</button>
        <button className="delete-btn" onClick={() => onDelete(user._id)}>Delete</button>
      </div>
    </div>
  );
};

export default UserCard;
