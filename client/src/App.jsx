import React, { Suspense, useState, useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore"; // Import Firestore functions

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Navbar from "./components/Navbar";
import SupportPage from './pages/SupportPage'; // General user Support Page

import "./assets/styles/main.css";
// import { BrowserRouter, Routes, Route } from 'react-router-dom' // ❌ Remove these, createBrowserRouter is used
import "./App.css";

// --- Lazy loaded pages for better performance ---
const HomePage = React.lazy(() => import("./pages/HomePage"));
const DepositPage = React.lazy(() => import("./pages/DepositPage"));
const WithdrawalPage = React.lazy(() => import("./pages/WithdrawalPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const SignupPage = React.lazy(() => import("./pages/SignupPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const AdminDashboard = React.lazy(() => import("./components/AdminDashboard"));
const AdminChatComponent = React.lazy(() => import("./components/AdminChatComponent.jsx")); // ✅ NEW: Import AdminChatComponent
const TwoFactorAuthPage = React.lazy(() => import("./pages/TwoFactorAuthPage")); // New 2FA Page
const ProfileSettingsPage = React.lazy(() => import("./pages/ProfileSettingsPage.jsx")); // NEW: Import ProfileSettingsPage
const ForgotPasswordPage = React.lazy(() => import("./pages/ForgotPasswordPage.jsx")); // NEW: Import ForgotPasswordPage

// --- Layouts ---
const LayoutWithNavbar = () => (
  <>
    <Navbar />
    <main>
      <Outlet />
    </main>
  </>
);

const LayoutWithoutNavbar = () => (
  <main>
    <Outlet />
  </main>
);

// --- Route Guards ---
const Loading = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '24px',
    color: '#6a0dad',
    backgroundColor: '#f8fafc'
  }}>
    Loading...
  </div>
);

const PrivateRoute = () => {
  const { isAuthenticated, authChecked } = useAuth();

  if (!authChecked) return <Loading />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const AdminRoute = () => {
  const { isAuthenticated, isAdmin, authChecked } = useAuth();

  if (!authChecked) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return isAdmin ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

const PublicRoute = () => {
  const { isAuthenticated, isAdmin, authChecked } = useAuth();

  if (!authChecked) return <Loading />;
  return !isAuthenticated
    ? <Outlet />
    : <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;
};

// New Two-Factor Authentication Route Guard
const TwoFARoute = () => {
  const { isAuthenticated, authChecked, userId, db, appId, is2FAEnabled, pendingEmailVerification } = useAuth(); // Get is2FAEnabled from AuthContext
  const [checking2FA, setChecking2FA] = useState(true);

  useEffect(() => {
    // If 2FA is not enabled for the user, no need to check for pending verification
    if (authChecked && isAuthenticated && !is2FAEnabled) {
      setChecking2FA(false);
      return;
    }

    // If 2FA is enabled and a verification is pending (e.g., after initial setup email sent)
    if (authChecked && isAuthenticated && is2FAEnabled && pendingEmailVerification) {
        setChecking2FA(false); // We know 2FA is pending, so don't need Firestore listener for this
        return;
    }

    setChecking2FA(false); // Assume no further checks needed if not pending or not enabled
  }, [isAuthenticated, authChecked, userId, db, appId, is2FAEnabled, pendingEmailVerification]);

  if (checking2FA) {
    return <Loading />; // Show loading while determining 2FA status
  }

  // If 2FA is enabled and there's a pending email verification (meaning the link was sent but not clicked yet)
  if (is2FAEnabled && pendingEmailVerification) {
    return <Navigate to="/2fa-verify" replace />;
  }

  // Otherwise, allow access to the nested routes (dashboard, deposit, etc.)
  return <Outlet />;
};

// --- Routing ---
const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <LayoutWithoutNavbar />,
      children: [
        { path: "/", element: <HomePage /> },
        {
          element: <PublicRoute />,
          children: [
            { path: "login", element: <LoginPage /> },
            { path: "signup", element: <SignupPage /> },
            { path: "forgot-password", element: <ForgotPasswordPage /> }, // NEW: Forgot Password Page Route
          ],
        },
        // Direct route for 2FA verification, accessible after login but before full dashboard access
        { path: "2fa-verify", element: <TwoFactorAuthPage /> },
      ],
    },
    {
      element: <LayoutWithNavbar />,
      children: [
        {
          element: <PrivateRoute />, // Ensures user is authenticated first
          children: [
            {
              element: <TwoFARoute />, // Enforces 2FA verification after authentication
              children: [
                { path: "dashboard", element: <DashboardPage /> },
                { path: "deposit", element: <DepositPage /> },
                { path: "withdraw", element: <WithdrawalPage /> },
                { path: "support", element: <SupportPage /> }, // General User Support Route
                { path: "profile-settings", element: <ProfileSettingsPage /> }, // NEW: Profile Settings Page
              ],
            },
          ],
        },
        {
          element: <AdminRoute />, // Admin route guard
          children: [
            { path: "admin", element: <AdminDashboard /> },
            { path: "admin/chat", element: <AdminChatComponent /> }, // ✅ NEW: Admin Chat Component Route
          ],
        },
      ],
    },
    {
      path: "*", // Catch-all for undefined routes
      element: <Navigate to="/" replace />,
    },
  ]);

  return (
    <Suspense fallback={<Loading />}>
      <RouterProvider
        router={router}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      />
    </Suspense>
  );
};

// --- App ---
const App = () => (
  <AuthProvider>
    <AppRoutes />
  </AuthProvider>
);

export default App;