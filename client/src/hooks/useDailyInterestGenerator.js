// src/hooks/useDailyInterestGenerator.js
import { useEffect } from 'react';
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { INVESTMENT_PLANS } from '../constants/investmentPlans';
import { calculateDailyInterest } from '../utils/calculators';
import { getFirestorePaths } from '../utils/firestorePaths'; // Import the utility function

export const useDailyInterestGenerator = (user, accountData, transactions, transactionsLoading) => {
    useEffect(() => {
        // Only run if user is logged in, account data is loaded, and transactions are not loading (to avoid race conditions)
        if (!user || transactionsLoading || accountData.loading) {
             console.log("Daily interest generator: Skipping - user not logged in, transactions loading, or account data loading.");
            return;
        }

        const dailyInterest = calculateDailyInterest(accountData.totalInvestment);

        // Only proceed if there's a positive daily interest to generate
        if (dailyInterest <= 0) {
            console.log("Daily interest generator: Skipping - no positive daily interest calculated.");
            return;
        }

        const currentPlan = INVESTMENT_PLANS.find(
            plan => accountData.totalInvestment >= plan.min && accountData.totalInvestment <= plan.max
        ) || INVESTMENT_PLANS[0];


        const generateInterest = async () => {
            const todayStr = new Date().toDateString();
            const hasInterestToday = transactions.some(t =>
                t.type === 'interest' && t.date && t.date.toDate().toDateString() === todayStr
            );

            if (!hasInterestToday && accountData.totalInvestment > 0) {
                try {
                    const paths = getFirestorePaths(user.uid);
                    const transCollectionRef = collection(firestore, paths.transactions);
                    const userDocRef = doc(firestore, paths.userDoc);

                    await addDoc(transCollectionRef, {
                        type: 'interest',
                        amount: dailyInterest,
                        status: 'completed',
                        date: serverTimestamp(),
                        description: `Daily interest from ${currentPlan.name}`
                    });

                    await updateDoc(userDocRef, {
                        totalInterest: (accountData.totalInterest || 0) + dailyInterest, // Ensure it's a number
                        lastUpdated: serverTimestamp()
                    });
                    console.log("Daily interest generated successfully for", user.uid, "Amount:", dailyInterest);
                } catch (error) {
                    console.error("Error generating daily interest for user", user.uid, ":", error);
                }
            } else if (hasInterestToday) {
                 console.log("Daily interest already generated for today for user", user.uid);
            } else if (accountData.totalInvestment <= 0) {
                 console.log("Daily interest generator: No investment to generate interest from.");
            }
        };

        // Delay generation slightly to ensure all data listeners are set up
        const timer = setTimeout(generateInterest, 2500); // Increased timeout slightly
        return () => clearTimeout(timer); // Cleanup on component unmount or dependency change
    }, [user, accountData, transactions, transactionsLoading]); // Add accountData to dependencies
};