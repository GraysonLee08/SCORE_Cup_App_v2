// frontend/src/components/Footer.js
// Footer component with Chicago SCORES branding and links

import React from "react";

const Footer = () => {
  return (
    <footer>
      <div style={{ padding: "0 2rem", maxWidth: "100%" }}>
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
              <li><a href="https://www.chicagoscores.org/our-k8-programs" target="_blank" rel="noopener noreferrer" className="footer-link">K-8 Programs</a></li>
              <li><a href="https://www.chicagoscores.org/junior-scores" target="_blank" rel="noopener noreferrer" className="footer-link">Junior SCORES</a></li>
              <li><a href="https://www.chicagoscores.org/elementary" target="_blank" rel="noopener noreferrer" className="footer-link">Elementary</a></li>
              <li><a href="https://www.chicagoscores.org/middle-school" target="_blank" rel="noopener noreferrer" className="footer-link">Middle School</a></li>
              <li><a href="https://www.chicagoscores.org/summer-camp" target="_blank" rel="noopener noreferrer" className="footer-link">Summer Camp</a></li>
            </ul>
          </div>

          {/* Column 3 - About & Events */}
          <div className="footer-column">
            <h4>About & Events</h4>
            <ul>
              <li><a href="https://www.chicagoscores.org/mission-and-impact" target="_blank" rel="noopener noreferrer" className="footer-link">Mission & Impact</a></li>
              <li><a href="https://www.chicagoscores.org/scores-cup" target="_blank" rel="noopener noreferrer" className="footer-link">SCORES Cup</a></li>
              <li><a href="https://www.chicagoscores.org/jamboree" target="_blank" rel="noopener noreferrer" className="footer-link">Jamboree</a></li>
              <li><a href="https://www.chicagoscores.org/community-poetry-slam" target="_blank" rel="noopener noreferrer" className="footer-link">Poetry Slam</a></li>
              <li><a href="https://www.chicagoscores.org/news" target="_blank" rel="noopener noreferrer" className="footer-link">News/Media</a></li>
            </ul>
          </div>

          {/* Column 4 - Get Involved */}
          <div className="footer-column">
            <h4>Get Involved</h4>
            <ul>
              <li><a href="https://www.chicagoscores.org/volunteer" target="_blank" rel="noopener noreferrer" className="footer-link">Volunteer</a></li>
              <li><a href="https://www.chicagoscores.org/donate" target="_blank" rel="noopener noreferrer" className="footer-link">Donate</a></li>
              <li><a href="https://www.chicagoscores.org/partners" target="_blank" rel="noopener noreferrer" className="footer-link">Our Partners</a></li>
              <li><a href="https://www.chicagoscores.org/careers" target="_blank" rel="noopener noreferrer" className="footer-link">Careers</a></li>
              <li><a href="https://www.chicagoscores.org/contact-us" target="_blank" rel="noopener noreferrer" className="footer-link">Contact Us</a></li>
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