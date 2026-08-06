import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import RouteProgress from '../components/RouteProgress';
import {
  LuBriefcase,
  LuCalendarClock,
  LuCircleHelp,
  LuLayoutDashboard,
  LuLogOut,
  LuMenu,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuUsers,
  LuUserCog,
  LuVideo,
  LuX,
} from 'react-icons/lu';
import { useAuth } from '../auth/AuthContext';
import InterviewReminders from '../components/InterviewReminders';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import avatarPlaceholder from '../assets/avatar-placeholder.png';

const SIDEBAR_KEY = 'hr_sidebar';

const navItems = [
  { to: '/hr', label: 'Overview', end: true, Icon: LuLayoutDashboard },
  { to: '/hr/jobs', label: 'Jobs', end: false, Icon: LuBriefcase },
  { to: '/hr/candidates', label: 'Candidates', end: false, Icon: LuUsers },
  { to: '/hr/scheduler', label: 'Scheduler', end: false, Icon: LuCalendarClock },
  { to: '/hr/recordings', label: 'Recordings', end: false, Icon: LuVideo },
  // Managing who has access is admin-only; hidden for members.
  { to: '/hr/team', label: 'Team', end: false, Icon: LuUserCog, adminOnly: true },
  // Last, and visible to everyone — a reference you reach for occasionally, not a daily stop.
  { to: '/hr/help', label: 'Help', end: false, Icon: LuCircleHelp },
];

function initials(name?: string): string {
  if (!name) return 'HR';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function HrLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  /*
   * Desktop sidebar collapse, remembered across sessions.
   *
   * Read lazily from localStorage rather than in an effect, so the layout renders in its
   * chosen state on first paint instead of showing the sidebar and then snapping it away.
   */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* private mode — the preference just will not persist */
    }
  }, [collapsed]);

  function signOut() {
    logout();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-brand-50 text-brand-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center justify-between px-5">
        <NavLink to="/hr" end className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <img
            src="/Favicon_Linkage.png"
            alt="Linkage ScreenAI"
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold text-slate-900">Linkage ScreenAI</span>
            <span className="text-[11px] font-medium tracking-wide text-slate-600">Recruiting</span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <LuX className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Menu
        </p>
        {navItems
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass} onClick={() => setOpen(false)}>
            <Icon className="h-4.5 w-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-slate-200/70 p-3">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/hr/settings"
                onClick={() => setOpen(false)}
                aria-label="Account settings"
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                    isActive ? 'bg-brand-50' : 'hover:bg-slate-100'
                  }`
                }
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.avatarUrl ?? avatarPlaceholder} alt={user?.name ?? 'Account'} />
                  <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
                  <p className="truncate text-xs text-slate-600">{user?.email}</p>
                </div>
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="top">Account settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <button
          type="button"
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <LuLogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Spans the whole window, sidebar included, so it reads as "the app is working"
          rather than as something happening inside one panel. */}
      <RouteProgress />

      {/* Desktop sidebar (fixed) */}
      {/* Slides out rather than unmounting, so collapsing animates instead of snapping and the
          nav keeps its scroll position when it comes back. */}
      <aside
        id="hr-sidebar"
        aria-hidden={collapsed}
        className={`fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200/70 bg-white transition-transform duration-200 ease-out motion-reduce:transition-none lg:block ${
          collapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'
        }`}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </aside>

      {/* Content */}
      <div
        className={`transition-[padding] duration-200 ease-out motion-reduce:transition-none ${
          collapsed ? 'lg:pl-0' : 'lg:pl-64'
        }`}
      >
        {/* Top header — mobile shows the menu button + brand; the bell shows on all sizes */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-md lg:px-6 dark:bg-[#0a0f1c]/85">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <LuMenu className="h-5 w-5" />
          </button>

          {/* Lives in the header, not the sidebar: a button inside the panel would collapse
              along with it, leaving no way back. */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-controls="hr-sidebar"
            aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            className="hidden rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:inline-flex"
          >
            {collapsed ? (
              <LuPanelLeftOpen className="h-5 w-5" />
            ) : (
              <LuPanelLeftClose className="h-5 w-5" />
            )}
          </button>

          {/* The brand is in the sidebar normally; when that is hidden it moves here so the
              app is still identifiable and there is a way home. */}
          {collapsed && (
            <NavLink to="/hr" end className="hidden items-center gap-2 lg:flex">
              <img
                src="/Favicon_Linkage.png"
                alt=""
                className="h-7 w-7 rounded-lg object-contain"
              />
              <span className="font-display text-base font-semibold text-slate-800">
                Linkage ScreenAI
              </span>
            </NavLink>
          )}
          <div className="flex items-center gap-2 lg:hidden">
            <img
              src="/Favicon_Linkage.png"
              alt="Linkage ScreenAI"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <span className="font-display text-base font-semibold text-slate-800">Linkage ScreenAI</span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </main>
      </div>

      {/* In-app interview reminders (toasts + browser notifications) */}
      <InterviewReminders />
    </div>
  );
}
