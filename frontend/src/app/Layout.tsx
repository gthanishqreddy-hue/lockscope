import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  BarChart3,
  BookOpen,
  Boxes,
  GitCompareArrows,
  Gauge,
  LayoutDashboard,
  ListTree,
  Lock,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Settings,
  ShieldCheck,
  Sun,
  SunMoon,
  X,
} from 'lucide-react';
import { useAppState, type ThemePreference } from './AppState';
import { readStorage, STORAGE_KEYS, writeStorage } from '../services/storage';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Explore',
    items: [
      { to: '/', label: 'Overview', icon: <LayoutDashboard size={17} aria-hidden /> },
      { to: '/locks', label: 'Lock Laboratory', icon: <Lock size={17} aria-hidden /> },
      { to: '/sets', label: 'Data Structure Lab', icon: <ListTree size={17} aria-hidden /> },
      { to: '/visualizer', label: 'Execution Visualizer', icon: <PlayCircle size={17} aria-hidden /> },
    ],
  },
  {
    section: 'Evidence',
    items: [
      { to: '/correctness', label: 'Correctness Center', icon: <ShieldCheck size={17} aria-hidden /> },
      { to: '/benchmarks', label: 'Benchmark Studio', icon: <Gauge size={17} aria-hidden /> },
      { to: '/results', label: 'Results Explorer', icon: <BarChart3 size={17} aria-hidden /> },
      { to: '/compare', label: 'Algorithm Comparison', icon: <GitCompareArrows size={17} aria-hidden /> },
    ],
  },
  {
    section: 'Reference',
    items: [
      { to: '/learn', label: 'Learning Center', icon: <BookOpen size={17} aria-hidden /> },
      { to: '/settings', label: 'Settings', icon: <Settings size={17} aria-hidden /> },
    ],
  },
];

const TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((s) => s.items.map((i) => [i.to, i.label])),
);

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const crumbs = [{ to: '/', label: 'LockScope' }];
  let path = '';
  for (const part of parts) {
    path += `/${part}`;
    crumbs.push({ to: path, label: TITLES[path] ?? decodeURIComponent(part) });
  }
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => (
          <li key={c.to}>
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <Link to={c.to}>{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function EnginePill() {
  const { engineState } = useAppState();
  const label =
    engineState.state === 'connected'
      ? 'Engine connected'
      : engineState.state === 'checking'
        ? 'Checking engine…'
        : 'Engine offline';
  const color =
    engineState.state === 'connected'
      ? 'var(--good)'
      : engineState.state === 'checking'
        ? 'var(--neutral-status)'
        : 'var(--text-muted)';
  return (
    <Link
      to="/settings"
      className="badge"
      style={{ textDecoration: 'none' }}
      title={engineState.error ?? label}
    >
      <span className="dot" style={{ background: color }} aria-hidden />
      {label}
    </Link>
  );
}

const THEME_ORDER: ThemePreference[] = ['system', 'dark', 'light'];

function ThemeButton() {
  const { theme, setTheme } = useAppState();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? 'system';
  const icon =
    theme === 'dark' ? (
      <Moon size={16} aria-hidden />
    ) : theme === 'light' ? (
      <Sun size={16} aria-hidden />
    ) : (
      <SunMoon size={16} aria-hidden />
    );
  return (
    <button
      type="button"
      className="btn btn-ghost icon-btn"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme} (click for ${next})`}
    >
      {icon}
    </button>
  );
}

function Toasts() {
  const { notices, dismissNotice } = useAppState();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          className="toast"
          style={{
            borderLeft: `3px solid ${n.tone === 'error' ? 'var(--critical)' : n.tone === 'success' ? 'var(--good)' : 'var(--accent)'}`,
          }}
        >
          <span style={{ flex: 1 }}>{n.text}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => dismissNotice(n.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEYS.sidebar) === '1');
  const location = useLocation();
  // The mobile drawer belongs to the page it was opened on, so navigating closes it.
  const [mobileOpenOn, setMobileOpenOn] = useState<string | null>(null);
  const mobileOpen = mobileOpenOn === location.pathname;
  const setMobileOpen = (open: boolean) => setMobileOpenOn(open ? location.pathname : null);
  useEffect(() => {
    const title = TITLES[location.pathname];
    document.title = title && title !== 'Overview' ? `${title} · LockScope` : 'LockScope';
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeStorage(STORAGE_KEYS.sidebar, c ? null : '1');
      return !c;
    });
  };

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="brand-mark" />
          <span className="brand-text">
            LockScope
            <small>Concurrent Systems Lab</small>
          </span>
        </Link>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.section} style={{ display: 'contents' }}>
              <div className="nav-section">{section.section}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-foot-text">
            <Boxes size={12} aria-hidden style={{ verticalAlign: -1 }} /> v{__APP_VERSION__} ·{' '}
            {__GIT_COMMIT__}
          </span>
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost icon-btn show-mobile"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
          <button
            type="button"
            className="btn btn-ghost icon-btn hide-mobile"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </button>
          <Breadcrumbs />
          <div className="topbar-spacer" />
          <EnginePill />
          <ThemeButton />
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
