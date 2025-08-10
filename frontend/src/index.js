import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Production-safe ResizeObserver fix
const setupResizeObserverFix = () => {
  // Only apply fix in browser environment
  if (typeof window === 'undefined') return;
  
  const OriginalResizeObserver = window.ResizeObserver;
  
  if (OriginalResizeObserver) {
    window.ResizeObserver = class SafeResizeObserver extends OriginalResizeObserver {
      constructor(callback) {
        const wrappedCallback = (entries, observer) => {
          try {
            callback(entries, observer);
          } catch (error) {
            if (error.message && error.message.includes('ResizeObserver loop completed with undelivered notifications')) {
              // Silently ignore this specific ResizeObserver error
              return;
            }
            // Re-throw other errors
            throw error;
          }
        };
        super(wrappedCallback);
      }
    };
  }

  // Simple error suppression for ResizeObserver errors in production
  if (process.env.NODE_ENV !== 'development') {
    window.addEventListener('error', (e) => {
      if (e.message && e.message.includes('ResizeObserver loop completed with undelivered notifications')) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
    });
  }
};

// Apply the fix
setupResizeObserverFix();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);