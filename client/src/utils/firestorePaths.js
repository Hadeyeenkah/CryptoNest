// src/utils/firestorePaths.js
import { firebaseConfig } from '../firebase'; // Assuming firebaseConfig is exported from firebase.js

export const getFirestorePaths = (userId) => {
    // Ensure __app_id is defined globally or passed if running in a Canvas-like environment
    const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;
    
    return {
        userDoc: `artifacts/${appId}/users/${userId}`, // Even segments for document
        transactions: `artifacts/${appId}/users/${userId}/transactions` // Odd segments for collection
    };
};