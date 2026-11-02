'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import Avatar from './Avatar';
import { useSocial } from './SocialProvider';
import { Icon, type IconName } from './icons';
import { Logo } from './Logo';
import ThemeMenu from './ThemeMenu';
import { streakOf, useActivity } from '@/lib/activity';
import { nowMs } from '@/lib/utils';

type NavLink = { href: string; label: string; icon: IconName; signedInOnly?: boolean };

const LINKS: NavLink[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/create', label: 'Create', icon: 'plus' },
  { href: '/library', label: 'My Library', icon: 'library' },
  { href: '/community', label: 'Community', icon: 'heart' },
  { href: '/messages', label: 'Messages', icon: 'chat', signedInOnly: true },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/library') {
    return pathname.startsWith('/library') || pathname.startsWith('/study');
  }
  if (href === '/community') {
    return (
      pathname.startsWith('/community') || pathname.startsWith('/people') || pathname.startsWith('/u/')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const pathname = usePathname();
  // Remember which page the menu was opened on, so it closes itself on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const streak = streakOf(useActivity(), nowMs());
  const auth = useAuth();
  const social = useSocial();
  const links = LINKS.filter((l) => !l.signedInOnly || auth.status === 'signedIn');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenOn(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Flashly home" className="shrink-0">
          {/* On narrow phones the icon alone leaves room for the buttons. */}
          <Logo wordmarkClassName="hidden min-[440px]:inline" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1.5 md:flex">
          {links.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
                  active
                    ? 'bg-ink text-bg'
                    : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {l.label}
                {l.href === '/messages' && social.unread > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[11px] font-extrabold"
                    style={{ color: '#1b1033' }}
                    aria-label={`${social.unread} unread`}
                  >
                    {social.unread > 99 ? '99+' : social.unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {streak > 0 && (
            <Link
              href="/library"
              className="chip bg-sun-soft"
              title={`${streak}-day study streak`}
              aria-label={`${streak}-day study streak`}
            >
              <Icon name="flame" size={14} className="text-coral" />
              {streak}
            </Link>
          )}
          <ThemeMenu />
          {auth.enabled && auth.status !== 'loading' && (
            auth.status === 'signedIn' ? (
              <Link
                href="/profile"
                className="shrink-0 rounded-full transition-transform duration-200 hover:scale-105"
                aria-label={`Your profile: ${social.profile?.displayName || auth.user?.name}`}
                title="Your profile"
              >
                <Avatar
                  size="sm"
                  person={
                    social.profile ?? {
                      avatar: null,
                      avatarColor: 'sun',
                      displayName: auth.user?.name ?? '',
                      username: auth.user?.email ?? '',
                    }
                  }
                />
              </Link>
            ) : (
              <Link href="/account" className="btn btn-secondary shrink-0 whitespace-nowrap !px-3.5 !py-2">
                Sign in
              </Link>
            )
          )}
          <Link href="/create" className="btn btn-primary hidden sm:inline-flex">
            <Icon name="sparkles" size={16} />
            New set
          </Link>
          <button
            type="button"
            className="btn btn-secondary !p-2.5 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="border-t-2 border-ink bg-bg px-4 py-4 md:hidden"
        >
          <ul className="flex flex-col gap-2">
            {links.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpenOn(null)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-bold ${
                      active
                        ? 'bg-ink text-bg'
                        : 'border-2 border-line bg-surface text-fg'
                    }`}
                  >
                    <Icon name={l.icon} />
                    {l.label}
                    {l.href === '/messages' && social.unread > 0 && (
                      <span
                        className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-coral px-2 text-xs font-extrabold"
                        style={{ color: '#1b1033' }}
                      >
                        {social.unread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
