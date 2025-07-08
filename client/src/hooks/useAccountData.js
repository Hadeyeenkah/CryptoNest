// src/hooks/useAccountData.js
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase'; // Assuming firestore is exported from firebase.js
import { getFirestorePaths } from '../utils/firestorePaths'; // Import the utility function

export const useAccountData = (user) => {
    const [accountData, setAccountData] = useState({
        totalInvestment: 0,
        totalInterest: 0,
        totalWithdrawal: 0,
        balance: 0,
        firstName: 'User',
        lastUpdated: null
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const paths = getFirestorePaths(user.uid);
        const profileRef = doc(firestore, paths.userDoc);

        const unsubscribe = onSnapshot(
            profileRef,
            (doc) => {
                try {
                    if (doc.exists()) {
                        const data = doc.data();
                        const totalInvestment = Number(data.totalInvestment) || 0;
                        const totalInterest = Number(data.totalInterest) || 0;
                        const totalWithdrawal = Number(data.totalWithdrawal) || 0;

                        const processedData = {
                            totalInvestment,
                            totalInterest,
                            totalWithdrawal,
                            balance: totalInvestment + totalInterest - totalWithdrawal,
                            firstName: data.firstName || data.displayName || 'User',
                            lastUpdated: data.lastUpdated || null
                        };
                        setAccountData(processedData);
                    } else {
                        // If document doesn't exist, initialize with default or user's display name
                        setAccountData(prev => ({
                            ...prev,
                            firstName: user.displayName || 'User',
                            totalInvestment: 0,
                            totalInterest: 0,
                            totalWithdrawal: 0,
                            balance: 0
                        }));
                    }
                } catch (err) {
                    console.error("Error processing account data:", err);
                    setError("Failed to process profile data.");
                } finally {
                    setLoading(false);
                }
            },
            (err) => {
                console.error("Error fetching profile:", err);
                if (err.code === 'permission-denied') {
                    setError("You don't have permission to view this profile. Please check Firebase rules.");
                } else {
                    setError("An error occurred while fetching your profile.");
                }
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user]);

    return { accountData, loading, error };
};