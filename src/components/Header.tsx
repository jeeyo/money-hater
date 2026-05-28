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
      return true;
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
    // logout() clears local state and navigates to /login on its own.
    void logout();
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
      className="h-14 bg-surface/80 backdrop-blur-xl
      border-b border-white/5 flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30"
    >
      {/* Subtle top line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />

      <div className="flex items-center gap-2 flex-1">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2.5 hover:bg-white/6 rounded-xl transition-colors text-slate-400 hover:text-slate-200"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="gradient-text font-display font-bold text-base md:hidden">
          Money Hater
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Account Switcher */}
        <div className="relative">
          <button
            onClick={toggleAccountMenu}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5
              bg-white/4 border border-white/8 rounded-full
              hover:bg-white/7 hover:border-amber-500/20 transition-all text-sm font-medium text-slate-300"
          >
            <Wallet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline-block max-w-[100px] truncate text-xs">
              {selectedAccount?.name || 'Account'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
          </button>

          {showAccountMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAccountMenu(false)} />
              <div
                className="absolute top-full right-0 mt-2 w-52 rounded-2xl shadow-2xl
                bg-surface-2 border border-white/8 z-50 overflow-hidden animate-slide-down
                shadow-black/60"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                <div className="px-4 py-2.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-white/5">
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
                          ? 'bg-amber-500/8 text-amber-300'
                          : 'text-slate-300 hover:bg-white/4'
                      }`}
                  >
                    <span className="text-sm">{account.name}</span>
                    {selectedAccount?.id === account.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
                    )}
                  </button>
                ))}
                <div className="border-t border-white/5">
                  <button
                    onClick={() => {
                      navigate('/accounts');
                      setShowAccountMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-500 hover:bg-white/4 flex items-center gap-2 transition-colors hover:text-slate-300"
                  >
                    <Settings className="w-3.5 h-3.5" />
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
            className="relative p-2.5 hover:bg-white/6 rounded-xl transition-colors text-slate-400 hover:text-slate-200"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
            )}
          </button>
          {showNotificationPanel && (
            <NotificationPanel
              onClose={() => setShowNotificationPanel(false)}
              triggerRef={notificationButtonRef}
            />
          )}
        </div>

        {/* User chip - hidden on small mobile */}
        <div
          className="hidden sm:flex items-center gap-2 px-2.5 py-1.5
          bg-white/4 border border-white/8 rounded-full"
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-bg text-[10px] font-bold"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #14b8a6)' }}
          >
            {initial}
          </div>
          <span className="text-xs font-medium text-slate-400 max-w-[80px] truncate">
            {user?.name || user?.username || 'User'}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2.5 hover:bg-white/6 rounded-xl transition-colors text-slate-500 hover:text-slate-300"
          aria-label="Toggle theme"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2.5 hover:bg-rose-500/10 rounded-xl transition-colors text-slate-600 hover:text-rose-400"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default Header;
