import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, LogOut, Menu, ChevronDown, Settings, Wallet, Bell } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useAccount } from '../context/useAccount';
import { useNotification } from '../context/useNotification';
import { NotificationPanel } from './NotificationPanel';

interface HeaderProps {
  onMenuClick: () => void;
  isSidebarCollapsed?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { accounts, selectedAccount, selectAccount } = useAccount();
  const { unreadCount } = useNotification();
  const navigate = useNavigate();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return true; // dark-first default
    }
    return true;
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

  const toggleNotifications = useCallback(() => {
    if (!showNotificationPanel) setShowAccountMenu(false);
    setShowNotificationPanel(!showNotificationPanel);
  }, [showNotificationPanel]);

  const toggleAccountMenu = useCallback(() => {
    if (!showAccountMenu) setShowNotificationPanel(false);
    setShowAccountMenu(!showAccountMenu);
  }, [showAccountMenu]);

  const initial = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  return (
    <header
      className="h-14 bg-[#1e293b]/80 dark:bg-[#1e293b]/80 backdrop-blur-xl
      border-b border-white/5 flex items-center justify-between px-4 sticky top-0 z-30"
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-white/10 rounded-xl transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-slate-300" />
        </button>

        {/* Mobile app name */}
        <span className="gradient-text font-bold text-base md:hidden">Money Hater</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Account Switcher */}
        <div className="relative">
          <button
            onClick={toggleAccountMenu}
            className="flex items-center gap-2 px-3 py-1.5
              bg-white/5 border border-white/10 rounded-full
              hover:bg-white/10 transition-all text-sm font-medium text-slate-300"
          >
            <Wallet className="w-4 h-4 text-violet-400" />
            <span className="hidden sm:inline-block max-w-[120px] truncate">
              {selectedAccount?.name || 'Select Account'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showAccountMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAccountMenu(false)} />
              <div
                className="absolute top-full right-0 mt-2 w-56 rounded-2xl shadow-2xl border border-white/10
                bg-[#1e293b] z-50 overflow-hidden animate-slide-down"
              >
                <div className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">
                  Switch Account
                </div>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => {
                      selectAccount(account);
                      setShowAccountMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors
                      ${
                        selectedAccount?.id === account.id
                          ? 'bg-violet-500/10 text-violet-300'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                  >
                    <span>{account.name}</span>
                    {selectedAccount?.id === account.id && (
                      <div className="w-2 h-2 rounded-full bg-violet-400" />
                    )}
                  </button>
                ))}
                <div className="border-t border-white/5">
                  <button
                    onClick={() => {
                      navigate('/accounts');
                      setShowAccountMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 flex items-center gap-2 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Manage Accounts
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button
            ref={notificationButtonRef}
            onClick={toggleNotifications}
            className="relative p-2 hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-slate-300" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            )}
          </button>
          {showNotificationPanel && (
            <NotificationPanel
              onClose={() => setShowNotificationPanel(false)}
              triggerRef={notificationButtonRef}
            />
          )}
        </div>

        {/* User chip */}
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5
          bg-white/5 border border-white/10 rounded-full"
        >
          <div
            className="w-6 h-6 bg-gradient-to-br from-violet-500 to-indigo-500
            rounded-full ring-2 ring-violet-500/30 flex items-center justify-center
            text-xs font-semibold text-white"
          >
            {initial}
          </div>
          <span className="text-sm font-medium text-slate-300 max-w-[100px] truncate">
            {user?.name || user?.username || 'User'}
          </span>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          aria-label="Toggle theme"
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-slate-300" />
          ) : (
            <Moon className="w-5 h-5 text-slate-700" />
          )}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5 text-slate-400 hover:text-rose-400 transition-colors" />
        </button>
      </div>
    </header>
  );
};

export default Header;
