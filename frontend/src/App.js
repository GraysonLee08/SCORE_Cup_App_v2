// frontend/src/App.js
// This is the MAIN file that shows the navigation bar and decides which page to show

import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DisplayScreen from "./components/DisplayScreen";
import AdminPanel from "./components/AdminPanel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import "./styles/tournament.css";

function App() {
  useEffect(() => {
    // Set the background image dynamically from the public folder
    const backgroundImage = `linear-gradient(rgba(248, 249, 250, 0.85), rgba(255, 255, 255, 0.85)), url("${process.env.PUBLIC_URL}/Copy+of+P1360801.webp")`;
    
    // Check if image exists before setting it
    const img = new Image();
    img.onload = () => {
      document.body.style.background = backgroundImage;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center center';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';
    };
    img.onerror = () => {
      // If image fails to load, keep the gradient background
      console.log('Soccer background image not found, using gradient background');
    };
    img.src = `${process.env.PUBLIC_URL}/Copy+of+P1360801.webp`;
  }, []);
  return (
    <Router>
      <div className="App">
        {/* Header */}
        <Header />

        {/* This decides which page to show */}
        <main>
          <Routes>
            <Route path="/" element={<DisplayScreen />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </Router>
  );
}

export default App;
