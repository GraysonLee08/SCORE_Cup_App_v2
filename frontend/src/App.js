// frontend/src/App.js
// This is the MAIN file that shows the navigation bar and decides which page to show

import React, { useEffect } from "react";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import DisplayScreen from "./components/DisplayScreen";
import AdminPanel from "./components/AdminPanel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import "./styles/tournament.css";

const Layout = () => {
  useEffect(() => {
    // Set initial gradient background immediately
    document.body.style.background = 'linear-gradient(rgba(248, 249, 250, 0.85), rgba(255, 255, 255, 0.85))';
    
    // Lazy load the background image
    const img = new Image();
    img.onload = () => {
      const backgroundImage = `linear-gradient(rgba(248, 249, 250, 0.85), rgba(255, 255, 255, 0.85)), url("${process.env.PUBLIC_URL}/Copy+of+P1360801.webp")`;
      document.body.style.background = backgroundImage;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center center';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';
    };
    img.onerror = () => {
      console.log('Soccer background image not found, using gradient background');
    };
    // Load image after initial render
    setTimeout(() => {
      img.src = `${process.env.PUBLIC_URL}/Copy+of+P1360801.webp`;
    }, 100);
  }, []);

  return (
    <div className="App">
      {/* Header */}
      <Header />

      {/* This decides which page to show */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DisplayScreen />
      },
      {
        path: "admin",
        element: <AdminPanel />
      }
    ]
  }
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
});

function App() {
  return <RouterProvider router={router} />;
}

export default App;
