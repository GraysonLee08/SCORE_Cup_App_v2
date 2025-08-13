// frontend/src/components/Header.js
// Simple header with logo, title, and page toggle

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Monitor, Settings } from "lucide-react";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminPage = location.pathname === '/admin';

  const handleAdminClick = (e) => {
    e.preventDefault();
    console.log('🔍 Admin Panel button clicked');
    console.log('🔍 Current location:', window.location.href);
    console.log('🔍 Navigating to /admin');
    
    // Force navigation with replace option
    try {
      navigate('/admin', { replace: true });
      console.log('✅ Navigation called successfully');
    } catch (error) {
      console.error('❌ Navigation failed:', error);
      // Fallback to window.location
      window.location.href = '/admin';
    }
  };

  const handleDisplayClick = (e) => {
    e.preventDefault();
    console.log('🔍 Display View button clicked');
    navigate('/');
  };

  return (
    <header>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "0 2rem", 
        maxWidth: "100%",
        position: "relative"
      }}>
        {/* Left - Logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <img 
            src="/America-Scores-Chicago-Logo.webp" 
            alt="Chicago SCORES Logo" 
            style={{ height: "75px", width: "auto" }}
          />
        </div>

        {/* Center - Title */}
        <div style={{ 
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center"
        }}>
          <h1 style={{ 
            fontFamily: "Lubalin, serif", 
            fontSize: "2.5rem", 
            margin: 0,
            letterSpacing: "0.02em"
          }}>
            SCORES Cup
          </h1>
        </div>

        {/* Right - Page Toggle */}
        <div>
          {isAdminPage ? (
            <button 
              onClick={handleDisplayClick}
              style={{
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                color: "white", 
                textDecoration: "none",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                transition: "background-color 0.2s ease-in-out",
                border: "none",
                cursor: "pointer"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
            >
              <Monitor className="w-5 h-5" />
              <span>Display View</span>
            </button>
          ) : (
            <button 
              onClick={handleAdminClick}
              onMouseDown={() => console.log('🔍 Admin button mouse down')}
              onMouseUp={() => console.log('🔍 Admin button mouse up')}
              style={{
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                color: "white", 
                textDecoration: "none",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                transition: "background-color 0.2s ease-in-out",
                border: "none",
                cursor: "pointer",
                zIndex: 1000
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                console.log('🔍 Admin button hover');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                console.log('🔍 Admin button unhover');
              }}
            >
              <Settings className="w-5 h-5" />
              <span>Admin Panel</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;