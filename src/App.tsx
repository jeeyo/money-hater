import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AccountProvider } from './context/AccountContext';
import { NotificationProvider } from './context/NotificationContext';
import { Login } from './pages/Login';

// Lazy-loaded routes. Login stays eager because it's the entry point for
// unauthenticated users; everything else only matters once we're past auth.
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })),
);
const SetPassword = lazy(() =>
  import('./pages/SetPassword').then((m) => ({ default: m.SetPassword })),
);
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Reports = lazy(() => import('./pages/Reports'));
const Accounts = lazy(() => import('./pages/Accounts'));
const BudgetDetails = lazy(() => import('./pages/BudgetDetails'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const FullPageSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
    <div className="rounded-full h-12 w-12 border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <PrivateRoute>
              <Transactions />
            </PrivateRoute>
          }
        />
        <Route
          path="/budgets"
          element={
            <PrivateRoute>
              <Budgets />
            </PrivateRoute>
          }
        />
        <Route
          path="/budgets/:id"
          element={
            <PrivateRoute>
              <BudgetDetails />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <Reports />
            </PrivateRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <PrivateRoute>
              <Accounts />
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
