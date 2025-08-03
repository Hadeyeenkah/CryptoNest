import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  setLogLevel,
} from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// === Firebase Config ===
export const defaultFirebaseConfig = {
  apiKey: "AIzaSyA916U_sSc-2_EqWVi9ADufMrJgMquLffo",
  authDomain: "cryptonest-29e9f.firebaseapp.com",
  projectId: "cryptonest-29e9f",
  storageBucket: "cryptonest-29e9f.appspot.com",
  messagingSenderId: "738278897218",
  appId: "1:738278897218:web:234949d0ce076c197d5fdb",
  measurementId: "G-J4GELN0ZD7",
};

let currentFirebaseConfig = defaultFirebaseConfig;
if (typeof __firebase_config !== "undefined") {
  try {
    const parsedConfig = JSON.parse(__firebase_config);
    if (parsedConfig && parsedConfig.apiKey && parsedConfig.projectId) {
      currentFirebaseConfig = parsedConfig;
      console.log("[Firebase] Using __firebase_config from environment.");
    } else {
      console.warn("[Firebase] __firebase_config is invalid, using default config.");
    }
  } catch (e) {
    console.error("[Firebase] Failed to parse __firebase_config, using default:", e);
  }
} else {
  console.log("[Firebase] __firebase_config not provided, using default.");
}

export const firebaseConfig = currentFirebaseConfig;

// --- Settings ---
const DEBUG = process.env.NODE_ENV === "development";
// Set ENABLE_EMULATORS to true when you want to use local emulators.
// Make sure your emulators are running (firebase emulators:start)
const ENABLE_EMULATORS = false; // Set to true for local development with emulators

// --- Validate Config ---
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error("❌ Firebase config is missing or invalid.");
}

// --- Initialize Firebase ---
export const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export let analytics = null;

// --- Log Level ---
if (DEBUG) {
  setLogLevel("debug");
  console.log("[Firebase] Debug logging enabled.");
} else {
  setLogLevel("error");
}

// --- Initialize Analytics ---
export const initializeAnalytics = async () => {
  try {
    if (typeof window !== "undefined" && (await isSupported())) {
      analytics = getAnalytics(app);
      DEBUG && console.log("[Firebase] Analytics initialized.");
    } else {
      DEBUG && console.log("[Firebase] Analytics not supported here.");
    }
  } catch (err) {
    console.warn("[Firebase] Analytics init failed:", err.message);
  }
};
initializeAnalytics();

// --- Emulators ---
if (ENABLE_EMULATORS && DEBUG) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    console.log("[Firebase] Connected to local emulators.");
  } catch (err) {
    console.warn("[Firebase] Emulator connection failed:", err.message);
  }
}

// --- Admin Helper Functions ---
// Helper function to check if current user is admin
export const checkAdminStatus = async (user) => {
  if (!user) return false;
  
  try {
    // Check custom claims first
    const token = await user.getIdTokenResult();
    if (token.claims.isAdmin === true) {
      return true;
    }
    
    // Fallback to profile document check
    const { doc, getDoc } = await import('firebase/firestore');
    const appId = 'cryptonest';
    const userProfileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/data`);
    const profileDoc = await getDoc(userProfileRef);
    
    if (profileDoc.exists()) {
      const profileData = profileDoc.data();
      return profileData.isAdmin === true;
    }
    
    return false;
  } catch (err) {
    console.error('Error checking admin status:', err);
    return false;
  }
};

// Helper function to get user profile and dashboard data
export const getUserData = async (userId) => {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const appId = 'cryptonest';
    
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
    const dashboardRef = doc(db, `artifacts/${appId}/users/${userId}/dashboardData/data`);
    
    const [profileDoc, dashboardDoc] = await Promise.all([
      getDoc(profileRef),
      getDoc(dashboardRef)
    ]);
    
    const profileData = profileDoc.exists() ? profileDoc.data() : {};
    const dashboardData = dashboardDoc.exists() ? dashboardDoc.data() : {};
    
    return {
      profile: {
        email: profileData.email || 'N/A',
        displayName: profileData.displayName || userId,
        isAdmin: profileData.isAdmin || false,
        createdAt: profileData.createdAt || null,
        status: profileData.status || 'active',
        balance: dashboardData.balance !== undefined ? dashboardData.balance : 0,
        totalInvested: dashboardData.totalInvested !== undefined ? dashboardData.totalInvested : 0,
        currentInvestment: dashboardData.currentInvestment || null,
        ...profileData,
        ...dashboardData
      }
    };
  } catch (err) {
    console.error(`Error fetching user data for ${userId}:`, err);
    return {
      profile: {
        email: 'Error fetching',
        displayName: 'Error fetching',
        isAdmin: false,
        createdAt: null,
        balance: 0,
        totalInvested: 0,
        status: 'error'
      }
    };
  }
};

// Helper function for real-time listeners cleanup
export const createCleanupTracker = () => {
  const unsubscribeFunctions = [];
  
  return {
    add: (unsubscribe) => {
      unsubscribeFunctions.push(unsubscribe);
    },
    cleanup: () => {
      unsubscribeFunctions.forEach(unsub => {
        try {
          unsub();
        } catch (err) {
          console.warn('Error during cleanup:', err);
        }
      });
      unsubscribeFunctions.length = 0;
    }
  };
};

// Connection status checker
export const checkFirebaseConnection = async () => {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const testDoc = doc(db, 'connection-test', 'test');
    await getDoc(testDoc);
    console.log('[Firebase] Connection successful');
    return true;
  } catch (err) {
    console.error('[Firebase] Connection failed:', err);
    return false;
  }
};

// Initialize connection check in development
if (DEBUG) {
  checkFirebaseConnection();
}