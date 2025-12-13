import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, LogOut, Menu, ChevronDown, Settings, Wallet, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useNotification } from '../context/NotificationContext';
import { NotificationPanel } from './NotificationPanel';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { accounts, selectedAccount, selectAccount } = useAccount();
  const { unreadCount } = useNotification();
  const navigate = useNavigate();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleNotifications = () => {
    if (!showNotificationPanel) {
      setShowAccountMenu(false);
    }
    setShowNotificationPanel(!showNotificationPanel);
  }

  const toggleAccountMenu = () => {
    if (!showAccountMenu) {
      setShowNotificationPanel(false);
    }
    setShowAccountMenu(!showAccountMenu);
  }

  return (
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5 text-slate-700 dark:text-white" />
        </button>

        {/* Search */}
        {/* <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div> */}
      </div>

      <div className="flex items-center gap-2">
        {/* Account Switcher */}
        <div className="relative">
          <button
            onClick={toggleAccountMenu}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Wallet className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-slate-900 dark:text-white hidden sm:inline-block">
              {selectedAccount?.name || 'Select Account'}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>

          {showAccountMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAccountMenu(false)}
              ></div>
              <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Switch Account
                </div>
                {accounts.map(account => (
                  <button
                    key={account.id}
                    onClick={() => {
                      selectAccount(account);
                      setShowAccountMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${selectedAccount?.id === account.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                  >
                    <span>{account.name}</span>
                    {selectedAccount?.id === account.id && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    )}
                  </button>
                ))}
                <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                <button
                  onClick={() => {
                    navigate('/accounts');
                    setShowAccountMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Manage Accounts
                </button>
              </div>
            </>
          )}
        </div>

        {/* Notification */}
        <div className="relative">
          <button
            onClick={toggleNotifications}
            className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5 text-slate-700 dark:text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            )}
          </button>
          {showNotificationPanel && <NotificationPanel onClose={() => setShowNotificationPanel(false)} />}
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
          <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-semibold text-white">
            {user?.name?.[0] || user?.username?.[0] || 'T'}
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-white">{user?.name || user?.username || 'Test User'}</span>
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          {darkMode ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-slate-700" />}
        </button>

        <button
          onClick={handleLogout}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5 text-slate-700 dark:text-white" />
        </button>
      </div>
    </header>
  );
};

export default Header;
