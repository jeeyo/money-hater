import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    return stored !== null ? stored === 'true' : true;
  });

  const handleToggleCollapse = () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  return (
    <div className="min-h-screen bg-bg text-slate-100 aurora-bg">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div
        className={`relative z-10 min-h-screen transition-[margin] duration-300 ease-in-out
          pb-24 md:pb-0
          ${isSidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}
      >
        <Header
          onMenuClick={() => setIsSidebarOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <main className="p-3 sm:p-4 md:p-5">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
