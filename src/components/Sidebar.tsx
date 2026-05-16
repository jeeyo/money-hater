import React from 'react';
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
          className="fixed inset-0 bg-[#0f172a]/70 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex-col
          hidden md:flex
          transition-[width] duration-300 ease-in-out
          bg-[#1e293b]/95 backdrop-blur-xl
          border-r border-white/5
          ${isCollapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-white/5 overflow-hidden shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-600/20">
            <img src="/icon-192.png" alt="Logo" className="w-5 h-5" />
          </div>
          <span
            className={`ml-3 gradient-text font-bold text-lg whitespace-nowrap
              transition-[opacity,width] duration-200
              ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
          >
            Money Hater
          </span>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full
            bg-violet-600 border border-violet-500 text-white
            flex items-center justify-center shadow-lg z-10
            hover:bg-violet-500 transition-colors"
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
                  transition-all duration-150 overflow-hidden
                  ${
                    active
                      ? 'bg-violet-500/10 text-violet-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-gradient-to-b from-violet-500 to-indigo-500" />
                )}
                <Icon className="w-5 h-5 shrink-0" />
                <span
                  className={`whitespace-nowrap transition-[opacity,width] duration-200
                    ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User avatar at bottom */}
        <div className="p-3 border-t border-white/5 flex items-center gap-3 overflow-hidden shrink-0">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500
            ring-2 ring-violet-500/30 shrink-0 flex items-center justify-center
            text-white text-xs font-semibold"
          >
            {initial}
          </div>
          <span
            className={`text-xs text-slate-400 whitespace-nowrap transition-[opacity,width] duration-200
              ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 delay-100'}`}
          >
            {displayName}
          </span>
        </div>
      </aside>

      {/* ── Mobile Drawer ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 z-50 flex-col
          flex md:hidden
          bg-[#1e293b]/98 backdrop-blur-xl border-r border-white/5
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-600/20">
            <img src="/icon-192.png" alt="Logo" className="w-5 h-5" />
          </div>
          <span className="gradient-text font-bold text-lg">Money Hater</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${
                    active
                      ? 'bg-violet-500/10 text-violet-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-gradient-to-b from-violet-500 to-indigo-500" />
                )}
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 flex items-center gap-3 shrink-0">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500
            ring-2 ring-violet-500/30 flex items-center justify-center text-white text-xs font-semibold"
          >
            {initial}
          </div>
          <span className="text-xs text-slate-400">{displayName}</span>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 h-16 md:hidden z-50
        bg-[#1e293b]/98 backdrop-blur-xl border-t border-white/5
        flex items-center justify-around px-2"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all
                ${active ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
