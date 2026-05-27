import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './globals.css';

const root = document.getElementById('root');
if (!root) {
    throw new Error('Root element ausente — index.html quebrado');
}

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
