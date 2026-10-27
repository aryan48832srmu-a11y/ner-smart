import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Route,
  TriangleAlert,
  Archive,
  BarChart3,
  Radio,
  Menu,
  X,
} from 'lucide-react';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/route-planner', label: 'Route Planner', icon: Route },
  { to: '/incidents', label: 'Incidents', icon: Map },
  { to: '/alerts', label: 'Alert Center', icon: TriangleAlert },
  { to: '/logistics', label: 'Logistics', icon: Archive },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Lock background scrolling and support Escape while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen bg-base-950 text-slate-700">
      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-base-925 md:flex lg:w-60">
        <div className="flex h-16 items-center gap-2 border-b border-line px-3 lg:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white">
            <Radio className="h-5 w-5" />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-extrabold tracking-wide text-slate-900">NER-SMART</p>
            <p className="text-[10px] leading-tight text-slate-400">Logistics & Accessibility Intelligence</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-2.5 py-2.5 lg:px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-600/20 text-accent-700'
                    : 'text-slate-400 hover:bg-base-700 hover:text-slate-700'
                }`
              }
              title={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" />
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="hidden lg:block">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE MODE
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="mobile-overlay absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="mobile-navigation"
            className="mobile-drawer safe-bottom absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-base-925 shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between gap-3 border-b border-line px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-extrabold tracking-wide text-slate-900">NER-SMART</p>
                  <p className="text-[10px] leading-tight text-slate-400">Logistics & Accessibility</p>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-md p-2 text-slate-400 hover:bg-base-700 hover:text-slate-800"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent-600/20 text-accent-700'
                        : 'text-slate-600 hover:bg-base-700 hover:text-slate-800'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-line px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE MODE
              </span>
            </div>
          </aside>
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col md:pl-16 lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-line bg-base-925/90 px-3 backdrop-blur sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-base-900 text-slate-600 hover:bg-base-700 hover:text-slate-900 md:hidden"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white sm:flex md:hidden">
              <Radio className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-900 lg:text-base">AI Situation Overview</h1>
              <p className="hidden truncate text-[11px] text-slate-400 sm:block">North Eastern Region · Real-time intelligence</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-base-800 px-3 py-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-xs text-slate-600">LIVE FEED</span>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
