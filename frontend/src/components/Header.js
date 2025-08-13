// frontend/src/components/Header.js
// Simple header with logo, title, and page toggle

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Monitor, Settings } from "lucide-react";

const Header = () => {
  const location = useLocation();
  const isAdminPage = location.pathname === '/admin';

  return (
    <header>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left - Logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <img 
            src="/America-Scores-Chicago-Logo.webp" 
            alt="Chicago SCORES Logo" 
            style={{ height: "75px", width: "auto" }}
          />
        </div>

        {/* Center - Title */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <h1 style={{ fontFamily: "Lubalin, serif", fontSize: "2.5rem", margin: 0 }}>
            SCORES Cup
          </h1>
        </div>

        {/* Right - Page Toggle */}
        <div>
          {isAdminPage ? (
            <Link 
              to="/" 
              style={{
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                color: "white", 
                textDecoration: "none",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                transition: "background-color 0.2s ease-in-out"
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.2)"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
            >
              <Monitor className="w-5 h-5" />
              <span>Display View</span>
            </Link>
          ) : (
            <Link 
              to="/admin" 
              style={{
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                color: "white", 
                textDecoration: "none",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                transition: "background-color 0.2s ease-in-out"
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.2)"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
            >
              <Settings className="w-5 h-5" />
              <span>Admin Panel</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;