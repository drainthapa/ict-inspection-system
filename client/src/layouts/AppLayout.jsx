import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Menu, X, LogOut, ChevronsLeft, ChevronsRight, KeyRound, LayoutDashboard,
  ClipboardPlus, Boxes, UserCircle2, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole } from '../utils/navigation.js';
import { ROLES } from '../utils/roles.js';
import { initials } from '../utils/format.js';

const COLLAPSE_KEY = 'ict.sidebarCollapsed';

function Identity({ compact }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
        <span className="text-sm font-bold tracking-tight text-white">SM</span>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-white">Sainamaina Municipality</p>
          <p className="truncate text-xs text-brand-200">ICT Inspection &amp; Maintenance</p>
        </div>
      )}
    </div>
  );
}

function NavItems({ role, compact, onNavigate }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {navForRole(role).map((section) => (
        <div key={section.title}>
          {!compact && (
            <p className="mb-1.5 px-3 text-xs font-medium text-brand-300">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={compact ? item.label : undefined}
                    className={({ isActive }) => [
                      'group flex min-h-touch items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                      compact ? 'justify-center' : '',
                      isActive
                        ? 'bg-white font-semibold text-brand-900'
                        : 'text-brand-50 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    {!compact && <span className="flex-1 truncate">{item.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-touch items-center gap-2 rounded-lg px-2 hover:bg-slate-100"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
          {initials(user.full_name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-900">{user.full_name}</span>
          <span className="block text-xs text-slate-500">{user.role_name}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-slate-500">{user.role_name}</p>
          </div>
          <NavLink to="/account" onClick={() => setOpen(false)} role="menuitem"
            className="flex min-h-touch items-center gap-3 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50">
            <KeyRound className="h-4 w-4" aria-hidden /> Account &amp; password
          </NavLink>
          <button onClick={logout} role="menuitem"
            className="flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-sm text-red-700 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function BottomNav({ role, onMenu }) {
  const middle = role === ROLES.WARD_USER
    ? { to: '/equipment', label: 'Equipment', icon: Boxes }
    : { to: '/inspections/new', label: 'Inspect', icon: ClipboardPlus };
  const items = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    middle,
    { to: '/account', label: 'Account', icon: UserCircle2 },
  ];
  const cls = ({ isActive }) => `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-brand-700' : 'text-slate-500'}`;

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden" aria-label="Quick">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={cls}>
          <Icon className="h-5 w-5" aria-hidden />{label}
        </NavLink>
      ))}
      <button onClick={onMenu} className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500">
        <Menu className="h-5 w-5" aria-hidden />Menu
      </button>
    </nav>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand-900 transition-[width] duration-200 lg:flex ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <div className={`flex h-16 items-center border-b border-white/10 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <Identity compact={collapsed} />
        </div>
        <NavItems role={user.role} compact={collapsed} />
        <button
          onClick={toggleCollapsed}
          className="flex min-h-touch items-center justify-center gap-2 border-t border-white/10 text-sm text-brand-200 hover:bg-white/5"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-5 w-5" /> : <><ChevronsLeft className="h-5 w-5" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile / tablet drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-[85%] max-w-xs animate-slide-in flex-col bg-brand-900" aria-label="Navigation">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <Identity />
              <button onClick={() => setDrawerOpen(false)} className="-mr-2 flex min-h-touch min-w-touch items-center justify-center rounded-lg text-brand-100 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems role={user.role} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setDrawerOpen(true)} className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 leading-tight lg:hidden">
              <p className="truncate text-sm font-semibold text-slate-900">Sainamaina Municipality</p>
              <p className="truncate text-xs text-slate-500">ICT Inspection</p>
            </div>
            {user.wards.length > 0 && (
              <div className="ml-1 hidden items-center gap-1 md:flex" aria-label="Your wards">
                <span className="mr-1 text-xs text-slate-500">Your wards</span>
                {user.wards.slice(0, 6).map((w) => <span key={w.id} className="ward-chip">{w.ward_number}</span>)}
                {user.wards.length > 6 && <span className="text-xs text-slate-500">+{user.wards.length - 6}</span>}
              </div>
            )}
          </div>
          <UserMenu />
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8 lg:px-8">
          <div className="mx-auto max-w-7xl"><Outlet /></div>
        </main>
      </div>

      <BottomNav role={user.role} onMenu={() => setDrawerOpen(true)} />
    </div>
  );
}
