import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  setLogLevel,
} from "firebase/firestore"; // Removed doc, getDoc, setDoc, Timestamp as they are not used here
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
export const db = getFirestore(app); // Renamed 'firestore' to 'db' for consistency
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
    connectFirestoreEmulator(db, "localhost", 8080); // Use 'db' instead of 'firestore'
    connectFunctionsEmulator(functions, "localhost", 5001); // Connect to Functions emulator
    console.log("[Firebase] Connected to local emulators.");
  } catch (err) {
    console.warn("[Firebase] Emulator connection failed:", err.message);
  }
}

// --- REMOVED: The ensureUserDocumentExists function has been moved to AuthContext.jsx ---
// It is no longer needed here as this file should only handle Firebase initialization.
