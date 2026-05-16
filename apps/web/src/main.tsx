import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/Auth';
import { AuthConsumePage } from './pages/AuthConsume';
import { HomePage } from './pages/Home';
import { IdentifyPage } from './pages/Identify';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/consume" element={<AuthConsumePage />} />
        <Route path="/devices/:deviceId/identify" element={<IdentifyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
