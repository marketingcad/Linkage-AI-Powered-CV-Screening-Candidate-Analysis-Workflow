import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import HrLayout from './layout/HrLayout';
import ApplyJobPage from './pages/ApplyJobPage';
import StatusPage from './pages/StatusPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import CandidateReportPage from './pages/CandidateReportPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import NotFoundPage from './pages/NotFoundPage';

const router = createBrowserRouter([
  // Login is the main index (HR-first). Applicants reach a role only via the shared
  // per-job links at /apply/:jobId (the app distributes tracked links per platform).
  { path: '/', element: <LoginPage /> },
  { path: '/apply/:jobId', element: <ApplyJobPage /> },
  { path: '/status/:token', element: <StatusPage /> },
  { path: '/login', element: <LoginPage /> },
  // Full-page, print-optimized candidate report (no dashboard chrome).
  {
    path: '/hr/candidates/:id/report',
    element: (
      <RequireAuth>
        <CandidateReportPage />
      </RequireAuth>
    ),
  },
  {
    path: '/hr',
    element: (
      <RequireAuth>
        <HrLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'jobs/:id', element: <JobDetailPage /> },
      { path: 'candidates', element: <CandidatesPage /> },
      { path: 'candidates/:id', element: <CandidateDetailPage /> },
      { path: 'settings', element: <AccountSettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
