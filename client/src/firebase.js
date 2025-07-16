import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  setLogLevel,
} from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions"; // Import getFunctions and connectFunctionsEmulator

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
export const functions = getFunctions(app); // Initialize and export Firebase Functions
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
    connectFirestoreEmulator(firestore, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001); // Connect to Functions emulator
    console.log("[Firebase] Connected to local emulators.");
  } catch (err) {
    console.warn("[Firebase] Emulator connection failed:", err.message);
  }
}

// --- Helper to capitalize ---
const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

// --- Ensure User Document Exists ---
// This function ensures the user's *profile* document exists and
// also creates initial *balance* and *dashboardData* documents if they don't exist.
export const ensureUserDocumentExists = async (user) => {
  if (!user || !user.uid) {
    console.warn("[Firestore] ensureUserDocumentExists called with invalid user.");
    return null;
  }

  // Paths for profile, balances, and dashboardData
  const profileRef = doc(
    firestore,
    "artifacts",
    firebaseConfig.appId,
    "users",
    user.uid,
    "profile",
    "data"
  );
  const balanceRef = doc(
    firestore,
    "artifacts",
    firebaseConfig.appId,
    "users",
    user.uid,
    "balances",
    "current"
  );
  const dashboardDataRef = doc(
    firestore,
    "artifacts",
    firebaseConfig.appId,
    "users",
    user.uid,
    "dashboardData",
    "data"
  );

  try {
    const profileSnap = await getDoc(profileRef);
    let calculatedDisplayName = "New User";
    let calculatedFullName = "New User";

    if (user.displayName) {
      calculatedDisplayName = user.displayName;
      calculatedFullName = user.displayName;
    } else if (user.email) {
      const emailPart = user.email.split("@")[0];
      let nameFromEmail = emailPart.split(".")[0];
      calculatedDisplayName = capitalize(nameFromEmail);
      calculatedFullName = capitalize(nameFromEmail);
    }

    // Prepare initial data for profile, balances, and dashboardData
    const initialProfileData = {
      uid: user.uid,
      email: user.email || null,
      displayName: calculatedDisplayName,
      fullName: calculatedFullName,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isAdmin: false, // Default to false
      is2FAEnabled: false, // New field: default 2FA to false
      btcWallet: null,
      ethWallet: null,
      usdtWallet: null,
    };

    const initialBalanceData = {
      USDT: 0, // Initial USDT balance
      // Add other currencies as needed (e.g., BTC: 0, ETH: 0)
    };

    const initialDashboardData = {
      totalInvested: 0,
      totalInterest: 0,
      totalWithdrawal: 0,
      currentPlan: null, // User's active investment plan
    };

    if (!profileSnap.exists()) {
      // Create profile document
      await setDoc(profileRef, initialProfileData);
      DEBUG && console.log(
        `[Firestore] Created user profile at ${profileRef.path}`
      );

      // Create initial balance document
      await setDoc(balanceRef, initialBalanceData);
      DEBUG && console.log(
        `[Firestore] Created user balance at ${balanceRef.path}`
      );

      // Create initial dashboard data document
      await setDoc(dashboardDataRef, initialDashboardData);
      DEBUG && console.log(
        `[Firestore] Created user dashboard data at ${dashboardDataRef.path}`
      );

      return { ...initialProfileData, ...initialBalanceData, ...initialDashboardData };
    } else {
      const existingProfileData = profileSnap.data();
      let needsProfileUpdate = false;
      const profileUpdateData = {};

      // Logic to update existing profile data (similar to your original)
      if ((existingProfileData.email === null || existingProfileData.email === "") && user.email) {
        profileUpdateData.email = user.email;
        needsProfileUpdate = true;
      } else if (existingProfileData.email !== user.email && user.email) {
        profileUpdateData.email = user.email;
        needsProfileUpdate = true;
      }

      if (
        existingProfileData.displayName !== calculatedDisplayName &&
        calculatedDisplayName !== "New User"
      ) {
        profileUpdateData.displayName = calculatedDisplayName;
        needsProfileUpdate = true;
      }

      if (
        existingProfileData.fullName !== calculatedFullName &&
        calculatedFullName !== "New User"
      ) {
        profileUpdateData.fullName = calculatedFullName;
        needsProfileUpdate = true;
      }

      // Initialize new wallet fields if they don't exist
      if (existingProfileData.btcWallet === undefined) { profileUpdateData.btcWallet = null; needsProfileUpdate = true; }
      if (existingProfileData.ethWallet === undefined) { profileUpdateData.ethWallet = null; needsProfileUpdate = true; }
      if (existingProfileData.usdtWallet === undefined) { profileUpdateData.usdtWallet = null; needsProfileUpdate = true; }
      if (existingProfileData.is2FAEnabled === undefined) { profileUpdateData.is2FAEnabled = false; needsProfileUpdate = true; }


      if (needsProfileUpdate) {
        profileUpdateData.updatedAt = Timestamp.now();
        await setDoc(profileRef, profileUpdateData, { merge: true });
        DEBUG && console.log(`[Firestore] Updated user profile:`, profileUpdateData);
      } else {
        DEBUG && console.log(
          `[Firestore] User profile exists, no update needed at ${profileRef.path}`
        );
      }

      // Ensure balance document exists (if not created by initial setup, e.g., for old users)
      const balanceSnap = await getDoc(balanceRef);
      if (!balanceSnap.exists()) {
        await setDoc(balanceRef, initialBalanceData);
        DEBUG && console.log(`[Firestore] Created missing balance document at ${balanceRef.path}`);
      }

      // Ensure dashboardData document exists (if not created by initial setup, e.g., for old users)
      const dashboardDataSnap = await getDoc(dashboardDataRef);
      if (!dashboardDataSnap.exists()) {
        await setDoc(dashboardDataRef, initialDashboardData);
        DEBUG && console.log(`[Firestore] Created missing dashboardData document at ${dashboardDataRef.path}`);
      }

      // Fetch the latest data to return
      const [updatedProfileSnap, updatedBalanceSnap, updatedDashboardSnap] = await Promise.all([
        getDoc(profileRef),
        getDoc(balanceRef),
        getDoc(dashboardDataRef)
      ]);

      return {
        ...(updatedProfileSnap.exists() ? updatedProfileSnap.data() : {}),
        ...(updatedBalanceSnap.exists() ? updatedBalanceSnap.data() : {}),
        ...(updatedDashboardSnap.exists() ? updatedDashboardSnap.data() : {}),
      };
    }
  } catch (err) {
    console.error(`[Firestore] Failed for UID ${user.uid}:`, err);
    throw err;
  }
};
