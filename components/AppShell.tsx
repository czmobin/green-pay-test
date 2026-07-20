'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from './store';
import CreateMeetingModal from './CreateMeetingModal';
import NotificationBell from './NotificationBell';
import {
  IconDashboard, IconCalendar, IconList, IconPlus, IconReminder,
  IconSun, IconLeaf, IconGoogle, IconCheck, IconSettings,
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
  const store = useStore();
  const me = store.people.ceo;
  const remCount = Object.values(store.minutes).flat().filter((x) => x.type === 'task' || x.type === 'reminder').length;

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
                {n.href === '/meetings' && <span className="cnt num">{store.meetings.length}</span>}
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
          <div className={'gcal' + (store.gcalConnected ? ' on' : '')}>
            <div className="row">
              <span className="gi"><IconGoogle size={17} /></span>
              <div><b>Google Calendar</b><small>{store.gcalConnected ? '۱۱ رویداد همگام شد' : 'همگام‌سازی دوطرفه'}</small></div>
            </div>
            <div className="st"><span className="dot" />{store.gcalConnected ? 'متصل · هم‌اکنون همگام شد' : 'متصل نشده'}</div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={store.connectGcal}>
              {store.gcalConnected ? 'قطع اتصال' : 'اتصال حساب Google'}
            </button>
          </div>
          <div className="side-user">
            <span className="ava" style={{ background: `linear-gradient(145deg,${me.color})` }}>{initials(me.name)}</span>
            <div><b>{me.name}</b><small>{me.role}</small></div>
            <button className="icon-btn" style={{ marginInlineStart: 'auto', width: 32, height: 32, border: 0, background: 'transparent' }} onClick={store.toggleTheme} aria-label="تغییر تم"><IconSun size={17} /></button>
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
          <button className="icon-btn only-desktop" onClick={store.connectGcal} aria-label="اتصال تقویم"
            style={store.gcalConnected ? { borderColor: 'color-mix(in srgb,var(--ok) 55%,var(--line))', color: 'var(--ok)' } : undefined}>
            {store.gcalConnected ? <IconCheck size={18} /> : <IconGoogle size={18} />}
          </button>
          <Link href="/settings" className="icon-btn only-mobile" aria-label="تعریف‌ها"><IconSettings size={18} /></Link>
          <NotificationBell />
          <button className="icon-btn only-mobile" onClick={store.toggleTheme} aria-label="تغییر تم"><IconSun size={18} /></button>
        </header>

        <main className="content">{children}</main>
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
    </div>
  );
}
