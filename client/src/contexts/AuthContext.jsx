import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  signInWithCustomToken,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  serverTimestamp // Ensure serverTimestamp is imported
} from "firebase/firestore";

import { auth as firebaseAuth, db as firebaseDb } from "../firebase";

const AuthContext = createContext();

// Helper function to ensure the user's profile document exists and is populated
const ensureUserDocumentExists = async (firebaseUser, dbInstance, currentAppId) => {
  if (!firebaseUser || !firebaseUser.uid || !dbInstance || !currentAppId) {
    console.warn("[AuthContext:ensureUserDocumentExists] called without valid Firebase user, dbInstance, or APP_ID.");
    return null;
  }

  const userProfileDocRef = doc(dbInstance, `artifacts/${currentAppId}/users/${firebaseUser.uid}/profile`, 'data');

  try {
    const docSnap = await getDoc(userProfileDocRef);

    let calculatedDisplayName = 'New User';
    let calculatedFullName = 'New User';

    if (firebaseUser.displayName) {
      calculatedDisplayName = firebaseUser.displayName;
      calculatedFullName = firebaseUser.displayName;
    } else if (firebaseUser.email) {
      const emailPart = firebaseUser.email.split('@')[0];
      if (emailPart) {
        let nameFromEmail = emailPart.split('.')[0];
        calculatedDisplayName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
        calculatedFullName = calculatedDisplayName;
      }
    }

    if (!docSnap.exists()) {
      console.log(`[AuthContext:ensureUserDocumentExists] Creating new user profile for UID: ${firebaseUser.uid}`);
      const newUserData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || null,
        displayName: calculatedDisplayName,
        fullName: calculatedFullName,
        createdAt: serverTimestamp(), // Use serverTimestamp()
        isAdmin: false, // Default to false for new users
        is2FAEnabled: false, // Default 2FA to false
        balance: 0, // Initialize balance
        totalInvested: 0, // Initialize totalInvested
        status: 'active', // Initialize status
        btcWallet: null,
        ethWallet: null,
        usdtWallet: null,
      };
      await setDoc(userProfileDocRef, newUserData);
      const newDocSnap = await getDoc(userProfileDocRef);
      return newDocSnap.exists() ? newDocSnap.data() : null;
    } else {
      const existingProfileData = docSnap.data();
      let needsUpdate = false;
      const updateData = {};

      // Update email if it's missing or has changed in Firebase Auth
      if (existingProfileData.email !== firebaseUser.email) {
        updateData.email = firebaseUser.email || null; // Ensure null if Firebase user has no email
        needsUpdate = true;
      }

      // Update displayName if it's 'New User' or doesn't match Firebase Auth display name
      if ((existingProfileData.displayName === 'New User' || !existingProfileData.displayName || existingProfileData.displayName !== calculatedDisplayName) && calculatedDisplayName !== 'New User') {
        updateData.displayName = calculatedDisplayName;
        needsUpdate = true;
      }

      // Update fullName if it's 'New User' or doesn't match calculatedFullName
      if ((existingProfileData.fullName === 'New User' || !existingProfileData.fullName || existingProfileData.fullName !== calculatedFullName) && calculatedFullName !== 'New User') {
        updateData.fullName = calculatedFullName;
        needsUpdate = true;
      }

      // Initialize new wallet fields if they don't exist
      if (existingProfileData.btcWallet === undefined) { updateData.btcWallet = null; needsUpdate = true; }
      if (existingProfileData.ethWallet === undefined) { updateData.ethWallet = null; needsUpdate = true; }
      if (existingProfileData.usdtWallet === undefined) { updateData.usdtWallet = null; needsUpdate = true; }
      if (existingProfileData.is2FAEnabled === undefined) { updateData.is2FAEnabled = false; needsUpdate = true; }
      if (existingProfileData.status === undefined) { updateData.status = 'active'; needsUpdate = true; }

      if (needsUpdate) {
        updateData.updatedAt = serverTimestamp(); // Add or update updatedAt timestamp
        await setDoc(userProfileDocRef, updateData, { merge: true });
        const newDocSnap = await getDoc(userProfileDocRef);
        return newDocSnap.exists() ? newDocSnap.data() : null;
      }

      return existingProfileData;
    }
  } catch (error) {
    console.error("[AuthContext:ensureUserDocumentExists] Error in ensureUserDocumentExists:", error);
    throw error;
  }
};

export const AuthProvider = ({ children }) => {
  const auth = firebaseAuth;
  const db = firebaseDb;

  // Use global variables provided by the Canvas environment
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // True when Firebase Auth state has been checked
  const [loading, setLoading] = useState(true); // Overall loading for auth state and initial profile
  const [profileLoading, setProfileLoading] = useState(false); // Specifically for profile data fetch/update
  const [offline, setOffline] = useState(!navigator.onLine);
  const [authError, setAuthError] = useState(null);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false); // State for email 2FA

  const unsubscribeProfileRef = useRef(null); // Ref to store the unsubscribe function for Firestore listener

  // Effect for handling online/offline status changes
  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Effect for initial Firebase Authentication (using custom token if available)
  // This runs once when the component mounts to handle Canvas-specific initial auth.
  useEffect(() => {
    if (!auth) {
      console.log("[AuthContext:InitialAuthEffect] Auth instance not ready, skipping initial auth attempt.");
      return;
    }

    const performInitialAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
          console.log("[AuthContext:InitialAuthEffect] Signed in with Canvas custom token successfully.");
        } else {
          // If no custom token, we rely on onAuthStateChanged for existing sessions
          console.log("[AuthContext:InitialAuthEffect] No Canvas custom token provided. Relying on existing session or user login.");
        }
      } catch (err) {
        console.error("[AuthContext:InitialAuthEffect] Initial authentication failed:", err);
        setAuthError(`Authentication failed: ${err.message}`);
      }
      // Note: setLoading(false) and setAuthChecked(true) are handled by the onAuthStateChanged listener
      // to ensure all subsequent state is consistent.
    };

    performInitialAuth();

  }, [auth, initialAuthToken]); // Dependencies: auth instance and initialAuthToken

  // Main effect for Firebase Authentication state changes and Firestore Profile Listener
  useEffect(() => {
    if (!auth || !db || !appId) {
      console.log("[AuthContext:AuthStateListenerEffect] Waiting for Firebase services to be ready (imported instances).");
      return;
    }

    console.log("[AuthContext:AuthStateListenerEffect] Firebase services are available. Setting up auth state listener.");

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("[AuthContext:AuthStateListenerEffect] Firebase Auth state changed. Current user UID:", firebaseUser ? firebaseUser.uid : "null");

      // Unsubscribe from previous profile listener if it exists
      if (unsubscribeProfileRef.current) {
        unsubscribeProfileRef.current();
        unsubscribeProfileRef.current = null;
        console.log("[AuthContext:AuthStateListenerEffect] Previous profile listener unsubscribed.");
      }

      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);
      setAuthChecked(true); // Auth state has been checked
      setAuthError(null); // Clear any previous auth errors

      if (firebaseUser) {
        setProfileLoading(true); // Start loading profile data
        const userProfileDocRef = doc(db, `artifacts/${appId}/users/${firebaseUser.uid}/profile`, 'data');
        console.log(`[AuthContext:AuthStateListenerEffect] Setting up real-time profile listener for path: artifacts/${appId}/users/${firebaseUser.uid}/profile/data`);

        // Set up real-time listener for the user's profile document
        unsubscribeProfileRef.current = onSnapshot(userProfileDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const profileData = docSnap.data();
              setUserProfile(profileData);
              console.log("[AuthContext:AuthStateListenerEffect] Real-time profile data received:", profileData);
            } else {
              console.warn("[AuthContext:AuthStateListenerEffect] User profile document does not exist in Firestore. Attempting to create/initialize...");
              // If profile doesn't exist, ensure it's created/initialized
              ensureUserDocumentExists(firebaseUser, db, appId)
                .then(profile => {
                  if (profile) {
                    setUserProfile(profile);
                    console.log("[AuthContext:AuthStateListenerEffect] Profile created/initialized successfully:", profile);
                  } else {
                    console.warn("[AuthContext:AuthStateListenerEffect] ensureUserDocumentExists did not return a profile.");
                  }
                })
                .catch(error => console.error("[AuthContext:AuthStateListenerEffect] Error during profile creation/initialization:", error));
            }
            setLoading(false); // Overall loading complete
            setProfileLoading(false); // Profile loading complete
            console.log("[AuthContext:AuthStateListenerEffect] Auth and profile check complete. Loading: false, AuthChecked: true.");
          },
          (error) => {
            console.error("[AuthContext:AuthStateListenerEffect] Error listening to user profile changes:", error);
            setAuthError(`Profile data error: ${error.message}`);
            setUserProfile(null); // Clear profile on error
            setLoading(false); // Overall loading complete
            setProfileLoading(false); // Profile loading complete
            console.log("[AuthContext:AuthStateListenerEffect] Auth check complete with profile error. Loading: false, AuthChecked: true.");
          }
        );
      } else {
        // No Firebase user (logged out or not authenticated)
        setUserProfile(null); // Clear user profile
        setLoading(false); // Overall loading complete
        setProfileLoading(false); // Profile loading complete
        console.log("[AuthContext:AuthStateListenerEffect] No Firebase user detected, userProfile cleared. Loading: false.");
      }
    });

    // Cleanup function for useEffect: unsubscribe from Firebase Auth and Firestore listeners
    return () => {
      unsubscribeAuth();
      if (unsubscribeProfileRef.current) {
        unsubscribeProfileRef.current();
      }
      console.log("[AuthContext:AuthStateListenerEffect] Cleanup completed.");
    };
  }, [auth, db, appId]); // Dependencies: Firebase auth, db instances, and appId

  // Callback to manually refresh user profile data
  const refreshProfile = useCallback(async (firebaseUser) => {
    if (!firebaseUser || !firebaseUser.uid || !db || !appId) {
      console.warn("[AuthContext] refreshProfile called without valid Firebase user, db, or APP_ID.");
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true); // Indicate profile is loading
    try {
      const profile = await ensureUserDocumentExists(firebaseUser, db, appId);
      setUserProfile(profile || null);
      console.log("[AuthContext] User profile refreshed:", profile);
    } catch (err) {
      console.error("[AuthContext] Error refreshing profile:", err);
      setAuthError(`Failed to refresh profile: ${err.message}`);
      setUserProfile(null);
    } finally {
      setProfileLoading(false); // Profile loading complete
    }
  }, [db, appId]); // Dependencies: db instance and appId

  // Function to handle user login
  const login = async (email, password) => {
    setLoading(true); // Start overall loading
    setAuthError(null); // Clear any previous errors
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("[Auth] User logged in successfully.");
      // onAuthStateChanged listener will handle setting user and profile
      return { success: true, user: userCredential.user };
    } catch (err) {
      console.error("[Auth] Login error:", err);
      setAuthError(err.message);
      return { success: false, error: err.message };
    } finally {
      // setLoading(false) is handled by onAuthStateChanged
    }
  };

  // Function to handle user logout
  const logout = async () => {
    setLoading(true); // Start overall loading
    try {
      await signOut(auth);
      console.log("[Auth] User logged out successfully.");
      return { success: true };
    } catch (err) {
      console.error("[Auth] Logout error:", err);
      setAuthError(`Logout failed: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      // setLoading(false) is handled by onAuthStateChanged
    }
  };

  // --- 2FA Specific Functions (Email Link) ---

  // Function to send the 2FA verification email link
  const send2FAEmailLink = useCallback(async (email) => {
    if (!auth) {
      throw new Error("Authentication service not ready.");
    }
    if (!email) {
      throw new Error("Email address is required to send 2FA link.");
    }

    setAuthError(null);
    setPendingEmailVerification(true); // Indicate that an email link has been sent

    // Define the URL to redirect to after email link is clicked
    // This URL must be in your Firebase Console -> Authentication -> Sign-in method -> Email link (passwordless sign-in) -> Authorized domains
    const actionCodeSettings = {
      url: `${window.location.origin}/2fa-verify`, // Redirect back to your 2FA verification page
      handleCodeInApp: true, // This must be true for email link sign-in
    };

    try {
      console.log(`[AuthContext] Sending 2FA verification email link to ${email}...`);
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Store the email in local storage to retrieve it after the user clicks the link
      localStorage.setItem('emailForSignIn', email);
      console.log("[AuthContext] 2FA verification email sent successfully.");
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error sending 2FA email link:", error);
      setAuthError(`Failed to send 2FA email: ${error.message}`);
      setPendingEmailVerification(false); // Reset on error
      return { success: false, error: error.message };
    }
  }, [auth]);

  // Function to complete 2FA sign-in using the email link
  const completeEmail2FASignIn = useCallback(async (email, emailLink) => {
    if (!auth) {
      throw new Error("Authentication service not ready.");
    }
    if (!isSignInWithEmailLink(auth, emailLink)) {
      throw new Error("Invalid email link.");
    }
    if (!email) {
      throw new Error("Email not found in local storage. Please try again from the login page.");
    }

    setAuthError(null);
    setLoading(true); // Show loading while signing in with email link

    try {
      console.log(`[AuthContext] Completing 2FA sign-in for ${email} using email link...`);
      const userCredential = await signInWithEmailLink(auth, email, emailLink);
      localStorage.removeItem('emailForSignIn'); // Clean up local storage
      setPendingEmailVerification(false); // Reset
      console.log("[AuthContext] 2FA sign-in with email link successful.");
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error("[AuthContext] Error completing 2FA sign-in with email link:", error);
      setAuthError(`Email link verification failed: ${error.message}`);
      setLoading(false); // Stop loading on error
      return { success: false, error: error.message };
    }
  }, [auth]);

  // Function to update 2FA status in user profile
  const update2FAStatus = useCallback(async (isEnabled) => {
    if (!db || !userId || !appId) {
      throw new Error("Database or user ID not available to update 2FA status.");
    }
    if (!user) {
      throw new Error("No authenticated user to update 2FA status for.");
    }

    const userProfileDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, 'data');
    try {
      await setDoc(userProfileDocRef, { is2FAEnabled: isEnabled, updatedAt: serverTimestamp() }, { merge: true });
      console.log(`[AuthContext] 2FA status updated to ${isEnabled} for user ${userId}.`);
      // Refresh profile to ensure UI reflects the change immediately
      await refreshProfile(user);
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error updating 2FA status:", error);
      setAuthError(`Failed to update 2FA status: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, [db, userId, appId, user, refreshProfile]);

  // --- Function to update user's full name in profile ---
  const updateFullName = useCallback(async (newFullName) => {
    if (!db || !userId || !appId) {
      throw new Error("Database or user ID not available to update full name.");
    }
    if (!user) {
      throw new Error("No authenticated user to update full name for.");
    }

    const userProfileDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, 'data');
    try {
      await setDoc(userProfileDocRef, { fullName: newFullName, updatedAt: serverTimestamp() }, { merge: true });
      console.log(`[AuthContext] Full name updated to ${newFullName} for user ${userId}.`);
      await refreshProfile(user); // Refresh profile to reflect changes
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error updating full name:", error);
      setAuthError(`Failed to update full name: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, [db, userId, appId, user, refreshProfile]);

  // --- Function to update crypto wallet addresses in user profile ---
  const updateCryptoProfile = useCallback(async (walletUpdates) => {
    if (!db || !userId || !appId) {
      throw new Error("Database or user ID not available to update crypto profile.");
    }
    if (!user) {
      throw new Error("No authenticated user to update crypto profile for.");
    }

    const userProfileDocRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, 'data');
    try {
      await setDoc(userProfileDocRef, { ...walletUpdates, updatedAt: serverTimestamp() }, { merge: true });
      console.log(`[AuthContext] Crypto profile updated for user ${userId}:`, walletUpdates);
      // Refresh profile to ensure UI reflects the change immediately
      await refreshProfile(user);
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error updating crypto profile:", error);
      setAuthError(`Failed to update crypto profile: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, [db, userId, appId, user, refreshProfile]);

  // --- Function to change user's password ---
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!user) {
      throw new Error("No authenticated user to change password for.");
    }
    if (!currentPassword || !newPassword) {
      throw new Error("Current and new passwords are required.");
    }
    if (newPassword.length < 6) { // Firebase minimum password length
      throw new Error("New password must be at least 6 characters long.");
    }

    setAuthError(null);
    try {
      // Reauthenticate user with their current credentials
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      console.log("[AuthContext] User reauthenticated successfully.");

      // Update password
      await updatePassword(user, newPassword);
      console.log("[AuthContext] Password updated successfully.");
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error changing password:", error);
      let errorMessage = "Failed to change password.";
      if (error.code === 'auth/wrong-password') {
        errorMessage = "Incorrect current password.";
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = "Please log out and log in again to change your password for security reasons.";
      } else {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [user]);

  // Function to send a password reset email
  const sendPasswordReset = useCallback(async (email) => {
    if (!auth) {
      throw new Error("Authentication service not ready.");
    }
    if (!email) {
      throw new Error("Email address is required to send a password reset link.");
    }

    setAuthError(null); // Clear any previous auth errors
    try {
      console.log(`[AuthContext] Sending password reset email to ${email}...`);
      await sendPasswordResetEmail(auth, email);
      console.log("[AuthContext] Password reset email sent successfully.");
      return { success: true };
    } catch (error) {
      console.error("[AuthContext] Error sending password reset email:", error);
      let errorMessage = "Failed to send password reset email.";
      if (error.code === 'auth/user-not-found') {
        errorMessage = "No user found with that email address.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "The email address is not valid.";
      } else {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [auth]);

  // The value provided by the AuthContext to its consumers
  const value = {
    user,
    userId,
    userProfile,
    authChecked, // Indicates if Firebase Auth state has been initialized
    isAuthReady: !!user, // Simple boolean for if a user object exists
    loading, // Overall loading for auth and initial profile data
    profileLoading, // Specifically for profile data operations
    offline,
    authError,
    login,
    logout,
    refreshProfile,
    auth, // Expose auth instance for direct Firebase Auth operations if needed
    db,   // Expose db instance for direct Firestore operations if needed
    appId,
    isAuthenticated: !!user, // More explicit flag for authentication status
    isAdmin: userProfile?.isAdmin || false, // Derived from userProfile
    // 2FA related exports
    is2FAEnabled: userProfile?.is2FAEnabled || false, // Derived from userProfile
    send2FAEmailLink,
    completeEmail2FASignIn,
    update2FAStatus,
    pendingEmailVerification,
    // Crypto Profile related exports
    updateCryptoProfile,
    // User Profile related exports
    updateFullName,
    changePassword,
    sendPasswordReset,
  };

  return (
    <AuthContext.Provider value={value}>
      {(loading || profileLoading) ? (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          height: "100vh", fontSize: "16px", flexDirection: "column",
          backgroundColor: '#f8fafc', color: '#333'
        }}>
          <p>Loading authentication and profile...</p>
          {authError && <p style={{ color: "red", marginTop: "10px" }}>{authError}</p>}
        </div>
      ) : (
        <>
          {offline && (
            <div style={{
              background: "#f59e0b", color: "white",
              padding: "8px", position: "fixed", top: 0, width: "100%", textAlign: "center", zIndex: 1000
            }}>
              You are offline. Some features may be limited.
            </div>
          )}
          <div style={{ marginTop: offline ? "32px" : "0" }}>
            {children}
          </div>
        </>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export default AuthContext;
