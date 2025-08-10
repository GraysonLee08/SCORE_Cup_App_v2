// frontend/src/components/Footer.js
// Footer component with Chicago SCORES branding and links

import React from "react";

const Footer = () => {
  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          {/* Column 1 - SCORES Logo */}
          <div className="footer-column footer-logo">
            <img src="/AS-CHI-Horizontal.webp" alt="Chicago SCORES Logo" />
            <p>Empowering youth through soccer and poetry in Chicago neighborhoods.</p>
          </div>

          {/* Column 2 - Programs */}
          <div className="footer-column">
            <h4>Programs</h4>
            <ul>
              <li><a href="#">K-8 Programs</a></li>
              <li><a href="#">Junior SCORES</a></li>
              <li><a href="#">Elementary</a></li>
              <li><a href="#">Middle School</a></li>
              <li><a href="#">Summer Camp</a></li>
            </ul>
          </div>

          {/* Column 3 - Get Involved */}
          <div className="footer-column">
            <h4>Get Involved</h4>
            <ul>
              <li><a href="#">Volunteer</a></li>
              <li><a href="#">Coach</a></li>
              <li><a href="#">Donate</a></li>
              <li><a href="#">Sponsor</a></li>
              <li><a href="#">Fundraise</a></li>
            </ul>
          </div>

          {/* Column 4 - Resources */}
          <div className="footer-column">
            <h4>Resources</h4>
            <ul>
              <li><a href="#">About Us</a></li>
              <li><a href="#">News & Events</a></li>
              <li><a href="#">Impact Stories</a></li>
              <li><a href="#">Contact</a></li>
              <li><a href="#">Careers</a></li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; 2024 Chicago SCORES. All rights reserved. | Tournament Management System</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;