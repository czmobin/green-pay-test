'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from './store';
import CreateMeetingModal from './CreateMeetingModal';
import NotificationBell from './NotificationBell';
import ConflictAlert from './ConflictAlert';
import UserMenu from './UserMenu';
import {
  IconDashboard, IconCalendar, IconList, IconPlus, IconReminder,
  IconLeaf, IconSettings, IconLogout,
} from './Icons';
import { initials } from '@/lib/data';

const nav = [
  { href: '/', label: 'داشبورد', icon: IconDashboard },
  { href: '/calendar', label: 'تقویم', icon: IconCalendar },
  { href: '/meetings', label: 'جلسات', icon: IconList },
  { href: '/reminders', label: 'یادآورها', icon: IconReminder },
];

function isActive(path: string, href: string) {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(href + '/');
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const store = useStore();
  const isLogin = path === '/login';

  // مسیرهای اپ فقط برای کاربر واردشده
  useEffect(() => {
    if (!isLogin && store.authChecked && !store.authed) router.replace('/login');
  }, [isLogin, store.authChecked, store.authed, router]);

  if (isLogin) return <>{children}</>;
  if (!store.authChecked || !store.authed) {
    return <div className="boot" style={{ minHeight: '100vh' }}><span className="boot-spin" />در حال بررسی نشست…</div>;
  }
  const me = store.people[store.currentUser];
  const roleLabel: Record<string, string> = { admin: 'ادمین', ceo: 'مدیرعامل', user: 'کاربر عادی', member: 'کاربر عادی' };
  const remCount = store.visibleMeetings.reduce((acc, m) => acc + (store.minutes[m.id] ?? []).filter((x) => x.type === 'task' || x.type === 'reminder').length, 0);

  return (
    <div className="shell">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="logo"><IconLeaf size={23} /></span>
          <span><b>گرین‌پی</b><span style={{ display: 'block', fontSize: 11.5, color: 'var(--sb-muted)' }}>اتاق جلسات سازمانی</span></span>
        </Link>

        <div className="nav-label">فضای کاری</div>
        <nav className="nav">
          {nav.map((n) => {
            const Ic = n.icon;
            return (
              <Link key={n.href} href={n.href} className={isActive(path, n.href) ? 'active' : ''}>
                <Ic size={19} />
                {n.label}
                {n.href === '/meetings' && <span className="cnt num">{store.visibleMeetings.length}</span>}
                {n.href === '/reminders' && remCount > 0 && <span className="cnt num">{remCount}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="nav-label">مدیریت</div>
        <nav className="nav">
          <Link href="/settings" className={isActive(path, '/settings') ? 'active' : ''}><IconSettings size={19} />تعریف‌ها</Link>
        </nav>

        <div className="side-foot">
          <div className="side-user">
            <span className="ava" style={{ background: `linear-gradient(145deg,${me?.color ?? 'var(--brand),var(--brand-deep)'})` }}>
              {me ? initials(me.name) : '—'}
            </span>
            <div><b>{me?.name ?? '…'}</b><small>
              {me && me.role && me.role !== roleLabel[store.role]
                ? `${roleLabel[store.role]} · ${me.role}`
                : roleLabel[store.role]}
            </small></div>
            <button className="icon-btn um-side" onClick={() => store.signOut()}
              aria-label="خروج" title="خروج از حساب"><IconLogout size={17} /></button>
          </div>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="main">
        <header className="topbar">
          <Link href="/" className="tb-brand">
            <span className="tb-logo"><IconLeaf size={19} /></span>
            <span className="tb-title">گرین‌پی<small>اتاق جلسات</small></span>
          </Link>
          <span className="spacer" />
          <button className="btn btn-ghost only-desktop" onClick={store.openCreate}>
            <IconPlus size={16} />جلسهٔ جدید
          </button>
          <Link href="/settings" className="icon-btn only-mobile" aria-label="تعریف‌ها"><IconSettings size={18} /></Link>
          <NotificationBell />
          <UserMenu />
        </header>

        <main className="content">
          {!store.ready ? (
            <div className="boot"><span className="boot-spin" />در حال بارگذاری داده‌ها…</div>
          ) : store.error ? (
            <div className="boot boot-err">
              <b>ارتباط با سرور برقرار نشد</b>
              <span>{store.error}</span>
              <button className="btn btn-primary" onClick={() => store.reload()}>تلاش دوباره</button>
            </div>
          ) : children}
        </main>
      </div>

      {/* ---------- Bottom nav (mobile) ---------- */}
      <nav className="bottomnav only-mobile">
        <Link href="/" className={isActive(path, '/') ? 'active' : ''}><IconDashboard size={22} /><span>داشبورد</span></Link>
        <Link href="/calendar" className={isActive(path, '/calendar') ? 'active' : ''}><IconCalendar size={22} /><span>تقویم</span></Link>
        <div className="fab"><button onClick={store.openCreate} aria-label="جلسهٔ جدید"><IconPlus size={24} /></button></div>
        <Link href="/meetings" className={isActive(path, '/meetings') ? 'active' : ''}><IconList size={22} /><span>جلسات</span></Link>
        <Link href="/reminders" className={isActive(path, '/reminders') ? 'active' : ''}><IconReminder size={22} /><span>یادآورها</span></Link>
      </nav>

      <CreateMeetingModal />
      <ConflictAlert />
    </div>
  );
}
