// Simple test app to verify React is working
import React from 'react';

function SimpleApp() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>🏆 SCORES Cup Tournament</h1>
      <p>Application is loading...</p>
      <p>Backend API: <a href="http://localhost:3002" target="_blank" rel="noopener noreferrer">http://localhost:3002</a></p>
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => window.location.href = '/admin'}>Go to Admin Panel</button>
      </div>
    </div>
  );
}

export default SimpleApp;