import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './state/AppContext';
import { AppLayout } from './layouts/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { RoutePlanner } from './pages/RoutePlanner';
import { Incidents } from './pages/Incidents';
import { Alerts } from './pages/Alerts';
import { Logistics } from './pages/Logistics';
import { Analytics } from './pages/Analytics';
import { ToastHost } from './components/ui/ToastHost';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/route-planner" element={<RoutePlanner />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/logistics" element={<Logistics />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastHost />
    </AppProvider>
  );
}