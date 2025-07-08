import axios from 'axios';

const API_BASE = 'http://localhost:5000/api'; // update port if needed

export const getUserInfo = () => axios.get(`${API_BASE}/users`);
export const getTransactions = () => axios.get(`${API_BASE}/transactions`);
export const getInvestments = () => axios.get(`${API_BASE}/investments`);
