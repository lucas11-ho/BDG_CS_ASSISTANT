import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWebIdentityRuntime } from './web-identity-runtime';
import './styles.css';

installWebIdentityRuntime();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
