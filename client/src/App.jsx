// src/App.jsx
import React, { Suspense, useState, useEffect } from "react";
import {
    createBrowserRouter,
    RouterProvider,
    Navigate,
    Outlet,
    useLocation // Import useLocation to read current path
} from "react-router-dom";
// Removed direct Firestore imports as they are handled in AuthContext
// import { doc, onSnapshot } from "firebase/firestore";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Navbar from "./components/Navbar";
import SupportPage from './pages/SupportPage';

import "./assets/styles/main.css";
import "./App.css";

// --- Import the new PostLoginRedirect component ---
import PostLoginRedirect from "./components/PostLoginRedirect";

// --- Lazy loaded pages for better performance ---
const HomePage = React.lazy(() => import("./pages/HomePage"));
const DepositPage = React.lazy(() => import("./pages/DepositPage"));
const WithdrawalPage = React.lazy(() => import("./pages/WithdrawalPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const SignupPage = React.lazy(() => import("./pages/SignupPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const AdminDashboard = React.lazy(() => import("./components/AdminDashboard"));
const AdminChatComponent = React.lazy(() => import("./components/AdminChatComponent.jsx"));
const TwoFactorAuthPage = React.lazy(() => import("./pages/TwoFactorAuthPage"));
const ProfileSettingsPage = React.lazy(() => import("./pages/ProfileSettingsPage.jsx"));
const ForgotPasswordPage = React.lazy(() => import("./pages/ForgotPasswordPage.jsx"));
const ResetPasswordPage = React.lazy(() => import("./components/ResetPasswordPage.jsx")); // <-- NEW: Lazy load ResetPasswordPage

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

// --- Route Guards & Helpers ---
const Loading = () => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        fontSize: '24px',
        color: '#6a0dad', // A nice vibrant color
        backgroundColor: '#f8fafc'
    }}>
        Loading...
    </div>
);

const PrivateRoute = () => {
    const { isAuthenticated, authChecked } = useAuth();

    if (!authChecked) return <Loading />;
    // If not authenticated, redirect to login
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    // If authenticated, allow access to nested routes (which might include 2FA check)
    return <Outlet />;
};

const AdminRoute = () => {
    const { isAuthenticated, isAdmin, authChecked } = useAuth();

    if (!authChecked) return <Loading />;
    if (!isAuthenticated) return <Navigate to="/login" replace />; // Must be authenticated
    if (!isAdmin) return <Navigate to="/dashboard" replace />; // Must be an admin

    return <Outlet />; // If authenticated and admin, allow access
};

const PublicRoute = () => {
    const { isAuthenticated, authChecked } = useAuth();

    if (!authChecked) return <Loading />;

    // If authenticated, redirect them away from public-only routes (login/signup).
    // They will then be handled by the the root '/' route and PostLoginRedirect.
    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }
    // If not authenticated, allow access to public routes
    return <Outlet />;
};

const TwoFARoute = () => {
    const { isAuthenticated, authChecked, is2FAEnabled, pendingEmailVerification } = useAuth();

    // Initial check: if auth is not ready or user is not authenticated, let parent PrivateRoute handle it.
    if (!authChecked || !isAuthenticated) {
        return <Loading />; // Or a more specific check if needed
    }

    // If 2FA is enabled and there's a pending email verification, redirect to 2FA verification page
    if (is2FAEnabled && pendingEmailVerification) {
        return <Navigate to="/2fa-verify" replace />;
    }

    // If 2FA is enabled and no pending verification, or 2FA is not enabled, allow access
    return <Outlet />;
};

// Helper component for the root path's content
const PublicOnlyHome = () => {
    const { isAuthenticated, authChecked } = useAuth();
    // Ensure authentication status is known before deciding
    if (!authChecked) return <Loading />;

    // If authenticated, let PostLoginRedirect handle where they should go
    if (isAuthenticated) {
        return <PostLoginRedirect />;
    }

    // If not authenticated, show the public HomePage
    return <HomePage />;
};


// --- Routing Configuration ---
const AppRoutes = () => {
    const router = createBrowserRouter([
        {
            // Routes without a Navbar (e.g., login, signup, home, 2FA verification)
            element: <LayoutWithoutNavbar />,
            children: [
                {
                    path: "/",
                    // This component will decide whether to show HomePage (unauthenticated)
                    // or redirect (authenticated via PostLoginRedirect)
                    element: <PublicOnlyHome />
                },
                {
                    element: <PublicRoute />, // Protects login/signup from authenticated users
                    children: [
                        { path: "login", element: <LoginPage /> },
                        { path: "signup", element: <SignupPage /> },
                        { path: "forgot-password", element: <ForgotPasswordPage /> },
                        { path: "reset-password", element: <ResetPasswordPage /> }, // <-- NEW: Add route for ResetPasswordPage
                    ],
                },
                { path: "2fa-verify", element: <TwoFactorAuthPage /> },
            ],
        },
        {
            // Routes with a Navbar (authenticated areas)
            element: <LayoutWithNavbar />,
            children: [
                {
                    element: <PrivateRoute />, // All routes under this must be authenticated
                    children: [
                        {
                            // Nested route for 2FA protection. All regular user pages go here.
                            element: <TwoFARoute />,
                            children: [
                                { path: "dashboard", element: <DashboardPage /> },
                                { path: "deposit", element: <DepositPage /> },
                                { path: "withdraw", element: <WithdrawalPage /> },
                                { path: "support", element: <SupportPage /> },
                                { path: "profile-settings", element: <ProfileSettingsPage /> },
                            ],
                        },
                        // Admin specific routes - these are only accessible if the user is an admin.
                        // Note: AdminRoute is a sibling to the TwoFARoute, as admins don't necessarily
                        // need to pass 2FA to access admin-specific pages, depending on your policy.
                        // If admins also need 2FA, nest AdminRoute inside TwoFARoute.
                        {
                            element: <AdminRoute />, // This guard ensures only admins can reach these paths
                            children: [
                                { path: "admin", element: <AdminDashboard /> },
                                { path: "admin/chat", element: <AdminChatComponent /> },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            path: "*", // Catch-all for any unmatched paths
            element: <Navigate to="/" replace />, // Redirect to home, which then handles auth status
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

// --- Main App Component ---
const App = () => (
    <AuthProvider>
        <AppRoutes />
    </AuthProvider>
);

export default App;
