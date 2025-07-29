// src/components/PostLoginRedirect.jsx
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Adjust path as needed

// A simple loading component (can be more elaborate)
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

const PostLoginRedirect = () => {
  const { isAuthenticated, isAdmin, authChecked, profileLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation(); // Get current location to prevent unnecessary redirects

  useEffect(() => {
    // Only proceed once authentication status and profile data are fully checked/loaded
    if (authChecked && !profileLoading) {
      if (isAuthenticated) {
        // User is logged in, determine the target dashboard
        const targetPath = isAdmin ? "/admin" : "/dashboard";

        // If the user is not already on the target path, navigate them
        if (location.pathname !== targetPath) {
          console.log(`[PostLoginRedirect] Authenticated user (Admin: ${isAdmin}) redirecting to: ${targetPath}`);
          navigate(targetPath, { replace: true });
        } else {
          console.log(`[PostLoginRedirect] Authenticated user (Admin: ${isAdmin}) already on target path: ${targetPath}. No redirection needed.`);
        }
      } else {
        // If not authenticated, redirect to login page.
        // This case should ideally be handled by PublicRoute, but acts as a fallback.
        if (location.pathname !== "/login") {
          console.log("[PostLoginRedirect] Not authenticated, redirecting to /login.");
          navigate("/login", { replace: true });
        }
      }
    }
  }, [isAuthenticated, isAdmin, authChecked, profileLoading, navigate, location.pathname]);

  // Show a loading indicator while authentication and profile data are being determined
  // or while the redirection is taking place.
  if (!authChecked || profileLoading) {
    return <Loading />;
  }

  // If we've reached this point and no redirect occurred (meaning user is already on targetPath),
  // render nothing or a placeholder, as the actual content will be rendered by the nested routes.
  return null;
};

export default PostLoginRedirect;
