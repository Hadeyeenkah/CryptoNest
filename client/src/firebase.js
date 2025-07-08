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
const ENABLE_EMULATORS = false;

// --- Validate Config ---
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error("❌ Firebase config is missing or invalid.");
}

// --- Initialize Firebase ---
export const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const firestore = getFirestore(app);
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
    console.log("[Firebase] Connected to local emulators.");
  } catch (err) {
    console.warn("[Firebase] Emulator connection failed:", err.message);
  }
}

// --- Helper to capitalize ---
const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

// --- Ensure User Document Exists ---
export const ensureUserDocumentExists = async (user) => {
  if (!user || !user.uid) {
    console.warn("[Firestore] ensureUserDocumentExists called with invalid user.");
    return null;
  }

  // ✅ Use proper Firestore path segments
  const userRef = doc(
    firestore,
    "artifacts",
    firebaseConfig.appId,
    "users",
    user.uid,
    "profile",
    "data"
  );

  try {
    const userSnap = await getDoc(userRef);
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

    if (!userSnap.exists()) {
      const newUserData = {
        uid: user.uid,
        email: user.email || null,
        displayName: calculatedDisplayName,
        fullName: calculatedFullName,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        balance: 0,
        totalInvestment: 0,
        totalInterest: 0,
        currentPlan: null,
        isAdmin: false,
      };
      await setDoc(userRef, newUserData);
      DEBUG && console.log(
        `[Firestore] Created user profile at artifacts/${firebaseConfig.appId}/users/${user.uid}/profile/data`
      );
      return newUserData;
    } else {
      const existingData = userSnap.data();
      let needsUpdate = false;
      const updateData = {};

      if ((existingData.email === null || existingData.email === "") && user.email) {
        updateData.email = user.email;
        needsUpdate = true;
      } else if (existingData.email !== user.email && user.email) {
        updateData.email = user.email;
        needsUpdate = true;
      }

      if (
        existingData.displayName !== calculatedDisplayName &&
        calculatedDisplayName !== "New User"
      ) {
        updateData.displayName = calculatedDisplayName;
        needsUpdate = true;
      }

      if (
        existingData.fullName !== calculatedFullName &&
        calculatedFullName !== "New User"
      ) {
        updateData.fullName = calculatedFullName;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateData.updatedAt = Timestamp.now();
        await setDoc(userRef, updateData, { merge: true });
        DEBUG && console.log(`[Firestore] Updated user profile:`, updateData);
        const updatedSnap = await getDoc(userRef);
        return updatedSnap.exists() ? updatedSnap.data() : null;
      }

      DEBUG && console.log(
        `[Firestore] User profile exists, no update needed at artifacts/${firebaseConfig.appId}/users/${user.uid}/profile/data`
      );
      return existingData;
    }
  } catch (err) {
    console.error(`[Firestore] Failed for UID ${user.uid}:`, err);
    throw err;
  }
};
