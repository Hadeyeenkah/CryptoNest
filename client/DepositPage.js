import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar.js';

const DepositPage = () => {
  const [plan, setPlan] = useState("");
  
  const handleDeposit = (e) => {
    e.preventDefault();

function DepositPage() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState('basic');
  const [amount, setAmount] = useState('');

  const handleDeposit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');

    try {
      const res = await fetch('/api/user/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan, amount }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        navigate('/dashboard');
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <Navbar />
      <form className="deposit-form" onSubmit={handleDeposit}>
        <h2>Make a Deposit</h2>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} required>
          <option value="basic">Basic Plan</option>
          <option value="premium">Premium Plan</option>
          <option value="vip">VIP Plan</option>
        </select>
        <input 
          type="number" 
          placeholder="Amount in USD" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)} 
          required 
        />
        <button type="submit">Deposit</button>
      </form>
    </>
  );
}

export default DepositPage;