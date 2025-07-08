import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx'; // Import useAuth from AuthContext

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth(); // Get isAuthenticated and logout from useAuth

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await logout(); // Use the logout function from AuthContext
      closeMenu();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          Crypto<span className="highlight">.Wealth</span>
        </Link>

        <div className={`menu-icon ${menuOpen ? 'active' : ''}`} onClick={toggleMenu}>
          <div className="bar"></div>
          <div className="bar"></div>
          <div className="bar"></div>
        </div>

        <ul className={`nav-menu ${menuOpen ? 'active' : ''}`}>
          <li className="nav-item">
            <Link to="/" className="nav-link" onClick={closeMenu}>Home</Link>
          </li>
          {isAuthenticated && ( // Conditionally render these links if authenticated
            <>
              <li className="nav-item">
                <Link to="/withdraw" className="nav-link" onClick={closeMenu}>Withdraw</Link>
              </li>
              <li className="nav-item">
                <Link to="/deposit" className="nav-link" onClick={closeMenu}>Deposit</Link>
              </li>
              <li className="nav-item">
                <Link to="/dashboard" className="nav-link" onClick={closeMenu}>Dashboard</Link>
              </li>
              <li className="nav-item">
                <Link to="/profile-settings" className="nav-link" onClick={closeMenu}>Profile Settings</Link>
              </li>
              <li className="nav-item">
                <Link to="/supportchat" className="nav-link" onClick={closeMenu}>Support Chat</Link> {/* Added Support Chat Link */}
              </li>
              <li className="nav-item">
                <button className="nav-link btn btn-secondary" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            </>
          )}
          {!isAuthenticated && ( // Show login/signup if not authenticated
            <>
              <li className="nav-item">
                <Link to="/login" className="nav-link" onClick={closeMenu}>Login</Link>
              </li>
              <li className="nav-item">
                <Link to="/signup" className="nav-link" onClick={closeMenu}>Sign Up</Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
