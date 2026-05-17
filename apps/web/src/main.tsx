import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/Auth';
import { AuthConsumePage } from './pages/AuthConsume';
import { DeviceManagePage } from './pages/DeviceManage';
import { DeviceSetupPage } from './pages/DeviceSetup';
import { FeedPage } from './pages/Feed';
import { HomePage } from './pages/Home';
import { IdentifyPage } from './pages/Identify';
import { MetricDetailPage } from './pages/MetricDetail';
import { PlantCardPage } from './pages/PlantCard';
import { SettingsPage } from './pages/Settings';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/consume" element={<AuthConsumePage />} />
        <Route path="/devices/:deviceId/identify" element={<IdentifyPage />} />
        <Route path="/devices/:id/manage" element={<DeviceManagePage />} />
        <Route path="/devices/:id/setup" element={<DeviceSetupPage />} />
        <Route path="/devices/:id/p/:metric" element={<MetricDetailPage />} />
        <Route path="/devices/:id" element={<PlantCardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
