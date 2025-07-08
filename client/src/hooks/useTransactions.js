// src/hooks/useTransactions.js
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase'; // Assuming firestore is exported from firebase.js
import { getFirestorePaths } from '../utils/firestorePaths'; // Import the utility function

export const useTransactions = (user) => {
    const [transactions, setTransactions] = useState([]);
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
        const transRef = collection(firestore, paths.transactions);
        // Note: orderBy('date', 'desc') requires an index in Firestore for 'transactions' collection on 'date' field.
        // If you encounter errors, you might need to remove orderBy and sort in memory, or create the index.
        const q = query(transRef, orderBy('date', 'desc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                try {
                    const transactionData = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    setTransactions(transactionData);
                } catch (err) {
                    console.error("Error processing transactions:", err);
                    setError("Failed to process transaction data.");
                } finally {
                    setLoading(false);
                }
            },
            (err) => {
                console.error("Error fetching transactions:", err);
                if (err.code === 'permission-denied') {
                    setError("You don't have permission to view transactions. Please check Firebase rules.");
                } else {
                    setError("An error occurred while fetching transactions.");
                }
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user]);

    return { transactions, loading, error };
};