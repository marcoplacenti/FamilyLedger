import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log('React index.tsx loading...');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('React app rendered');