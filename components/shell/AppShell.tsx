'use client';

import { usePathname } from 'next/navigation';
import { LiveStateProvider } from '@/lib/store/live';
import { MobileNav, Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SearchPalette } from './SearchPalette';
import { DemoBanner } from './DemoBanner';

/**
 * The command deck: a fixed shell, never a scrolling document. The universe
 * route owns its own layout (galaxy + contextual panel + activity stream);
 * every other route is a conventional scrolling workspace.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isUniverse = pathname === '/';

  // Auth pages have no workforce to show, so they get no chrome and no polling.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  ) {
    return <>{children}</>;
  }

  return (
    <LiveStateProvider>
      <div className="starfield flex h-dvh flex-col overflow-hidden">
        <DemoBanner />
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main
            className={
              isUniverse
                ? 'flex min-w-0 flex-1'
                : 'scroll-thin min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0'
            }
          >
            {children}
          </main>
        </div>
        <MobileNav />
        <SearchPalette />
      </div>
    </LiveStateProvider>
  );
}
