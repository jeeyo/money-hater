import { CalendarDays, Camera, Map, Settings, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Timeline', icon: CalendarDays },
  { to: '/trips', label: 'Trips', icon: Map },
  { to: '/upload', label: 'Upload', icon: Camera },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItems({ vertical }: { vertical?: boolean }) {
  return (
    <>
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            [
              'flex items-center gap-1 transition-colors',
              vertical
                ? 'w-full rounded-lg px-3 py-2 text-sm font-medium gap-3'
                : 'flex-col px-2 py-1.5 text-[11px] font-medium flex-1',
              isActive
                ? vertical
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-brand-600'
                : 'text-ink-3 hover:text-ink',
            ].join(' ')
          }
        >
          <Icon className={vertical ? 'size-5' : 'size-6'} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar on ≥md */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-r md:border-line md:bg-surface md:p-4">
        <div className="mb-4 flex items-center gap-2.5 px-3">
          <img src="/logo.png" alt="" className="size-10" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-ink">Money Hater</h1>
            <p className="text-xs text-ink-4">trip logger</p>
          </div>
        </div>
        <NavItems vertical />
      </aside>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-24 pt-4 md:pb-8">
        {children}
      </main>

      {/* Bottom tab bar on mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <NavItems />
      </nav>
    </div>
  );
}
