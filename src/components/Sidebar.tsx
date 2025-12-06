import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Wallet, BarChart3, CreditCard, Settings } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
    { path: '/budgets', icon: Wallet, label: 'Budgets' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
    { path: '/accounts', icon: CreditCard, label: 'Accounts' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
            <img src="/icon-192.png" alt="Money Hater Logo" className="w-6 h-6" />
          </div>
          <span className="text-slate-900 dark:text-white font-semibold text-lg">Money Hater</span>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                  ? 'bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
