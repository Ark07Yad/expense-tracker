import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);
