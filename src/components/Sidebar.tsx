import React, { useRef, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  BarChart3,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { path: '/budgets', icon: Wallet, label: 'Budgets' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/accounts', icon: CreditCard, label: 'Accounts' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const initial = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const displayName = user?.name || user?.username || 'User';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex-col
          hidden md:flex
          transition-[width] duration-300 ease-in-out
          bg-surface/95 backdrop-blur-xl
          border-r border-white/5
          ${isCollapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Top highlight line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-white/5 overflow-hidden shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            <img src="/icon-192.png" alt="Logo" className="w-5 h-5" />
          </div>
          <span
            className={`ml-3 gradient-text font-display font-bold text-lg whitespace-nowrap
              transition-[opacity,width] duration-200
              ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
          >
            Money Hater
          </span>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full z-10
            flex items-center justify-center shadow-lg
            bg-amber-500 border border-amber-400 text-bg
            hover:bg-amber-400 transition-all hover:scale-110"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-hidden mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 overflow-hidden group
                  ${
                    active
                      ? 'text-amber-300'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/4'
                  }`}
              >
                {/* Active amber background */}
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-amber-500/10 shadow-[inset_0_1px_0_rgba(245,158,11,0.15)]" />
                )}
                {/* Left accent bar */}
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-gradient-to-b from-amber-400 to-amber-600" />
                )}
                {/* Hover glow */}
                {!active && (
                  <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity bg-white/3" />
                )}
                <Icon
                  className={`w-5 h-5 shrink-0 relative z-10 transition-colors ${active ? 'text-amber-400' : ''}`}
                />
                <span
                  className={`whitespace-nowrap transition-[opacity,width] duration-200 relative z-10
                    ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
                >
                  {item.label}
                </span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)] relative z-10" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User at bottom */}
        <div className="p-3 border-t border-white/5 flex items-center gap-3 overflow-hidden shrink-0">
          <div
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center
            text-bg text-xs font-bold shadow-lg shadow-amber-500/20"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #14b8a6)' }}
          >
            {initial}
          </div>
          <div
            className={`min-w-0 transition-[opacity,width] duration-200
              ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
          >
            <p className="text-xs font-medium text-slate-300 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-600">Account</p>
          </div>
        </div>
      </aside>

      {/* ── Mobile Drawer ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 z-50 flex-col
          flex md:hidden
          bg-surface/98 backdrop-blur-xl border-r border-white/5
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5 shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            <img src="/icon-192.png" alt="Logo" className="w-5 h-5" />
          </div>
          <span className="gradient-text font-display font-bold text-xl">Money Hater</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${
                    active
                      ? 'text-amber-300'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/4'
                  }`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-amber-500/10 shadow-[inset_0_1px_0_rgba(245,158,11,0.15)]" />
                )}
                {active && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r bg-gradient-to-b from-amber-400 to-amber-600" />
                )}
                <Icon className={`w-5 h-5 shrink-0 relative z-10 ${active ? 'text-amber-400' : ''}`} />
                <span className="relative z-10">{item.label}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)] relative z-10" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 flex items-center gap-3 shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-bg text-xs font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #14b8a6)' }}
          >
            {initial}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">{displayName}</p>
            <p className="text-xs text-slate-600">Account</p>
          </div>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <MobileBottomNav navItems={navItems} isActive={isActive} />
    </>
  );
};

interface MobileBottomNavProps {
  navItems: typeof navItems;
  isActive: (path: string) => boolean;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ navItems, isActive }) => {
  const activeIndex = navItems.findIndex((item) => isActive(item.path));
  const pillRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const updatePill = () => {
      const el = itemRefs.current[activeIndex];
      if (!el || !pillRef.current) return;
      const parent = pillRef.current.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setPillStyle({
        left: elRect.left - parentRect.left,
        width: elRect.width,
      });
    };
    const timer = setTimeout(() => {
      setMounted(true);
      updatePill();
    }, 50);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-surface/95 backdrop-blur-xl border-t border-white/5" />
      {/* Top highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

      <div className="relative flex items-center justify-around h-16 px-1">
        {/* Animated pill */}
        <div
          ref={pillRef}
          className="absolute top-2 bottom-2 rounded-xl bg-amber-500/10 border border-amber-500/15 transition-all duration-300 ease-out"
          style={{
            left: pillStyle.left,
            width: pillStyle.width,
            opacity: mounted ? 1 : 0,
          }}
        />

        {navItems.map((item, i) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-0 flex-1 max-w-[72px]
                ${active ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`} />
              <span className="text-[9px] font-medium leading-none tracking-wide truncate w-full text-center">
                {item.label}
              </span>
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,1)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default Sidebar;
