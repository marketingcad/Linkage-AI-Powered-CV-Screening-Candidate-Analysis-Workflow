import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
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
import SchedulerPage from './pages/SchedulerPage';
import CandidateReportPage from './pages/CandidateReportPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import HelpPage from './pages/HelpPage';
import ErrorBoundary, { RouteErrorBoundary } from './components/ErrorBoundary';
import AiInterviewPage from './pages/AiInterviewPage';
import TeamPage from './pages/TeamPage';
import InterviewRecordingsPage from './pages/InterviewRecordingsPage';
import NotFoundPage from './pages/NotFoundPage';

const routes: RouteObject[] = [
  // Login is the main index (HR-first). Applicants reach a role only via the shared
  // per-job links at /apply/:jobId (the app distributes tracked links per platform).
  { path: '/', element: <LoginPage /> },
  { path: '/apply/:jobId', element: <ApplyJobPage /> },
  { path: '/status/:token', element: <StatusPage /> },
  { path: '/interview', element: <AiInterviewPage /> },
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
      { path: 'scheduler', element: <SchedulerPage /> },
      { path: 'recordings', element: <InterviewRecordingsPage /> },
      { path: 'settings', element: <AccountSettingsPage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'team', element: <TeamPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

// Attached here rather than route by route so a route added later is covered by default.
// An error bubbles to the nearest ancestor with an errorElement, so putting it on each
// top-level entry also covers every child of /hr.
const router = createBrowserRouter(
  routes.map((route) => ({ ...route, errorElement: <RouteErrorBoundary /> })),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outside the router, so a crash while rendering a route still has somewhere to land —
        inside it, the boundary would go down with the tree it was meant to catch. */}
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
