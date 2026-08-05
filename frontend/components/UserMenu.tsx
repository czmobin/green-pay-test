'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from './store';
import { api } from '@/lib/api';
import PasswordDialog from './PasswordDialog';
import { initials } from '@/lib/data';
import { IconSun, IconMoon, IconLogout, IconCheck, IconReport, IconSettings, IconAlert } from './Icons';

const roleLabels: Record<string, string> = {
  admin: 'ادمین', ceo: 'مدیرعامل', user: 'کاربر عادی', member: 'کاربر عادی',
};

/**
 * منوی کاربر — آواتار در تاپ‌بار (موبایل و دسکتاپ) که تغییر تم و خروج
 * را در خود دارد. منو دقیقاً زیر همان دکمه باز می‌شود.
 */
export default function UserMenu() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [hasPw, setHasPw] = useState<boolean | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const me = store.me ?? store.people[store.currentUser];

  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-theme');
    setDark(cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme:dark)').matches);
  }, []);

  useEffect(() => {
    if (!open || hasPw !== null) return;
    api.passwordState().then((d) => setHasPw(d.hasPassword)).catch(() => setHasPw(null));
  }, [open, hasPw]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function switchTheme(next: boolean) {
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try { localStorage.setItem('gp-theme', next ? 'dark' : 'light'); } catch { /* حالت خصوصی */ }
  }

  return (
    <div className="um-wrap" ref={wrap}>
      <button className="um-btn" onClick={() => setOpen((v) => !v)} aria-label="حساب کاربری"
        aria-expanded={open}>
        <span className="ava sm" style={{ background: `linear-gradient(145deg,${me?.color ?? '#0E9F6E,#08281E'})` }}>
          {me ? initials(me.name) : '—'}
        </span>
      </button>

      {open && (
        <div className="um-panel" role="menu">
          <div className="um-head">
            <span className="ava" style={{ background: `linear-gradient(145deg,${me?.color ?? '#0E9F6E,#08281E'})` }}>
              {me ? initials(me.name) : '—'}
            </span>
            <div>
              <b>{me?.name ?? '—'}</b>
              <small>{roleLabels[store.role] ?? 'کاربر'}{me?.role ? ` · ${me.role}` : ''}</small>
            </div>
          </div>

          {/* در موبایل نوار کناری دیده نمی‌شود، پس مسیرهای مدیریت اینجا می‌آیند */}
          <div className="um-section only-mobile">مدیریت</div>
          {store.isManager && (
            <Link href="/reports" className="um-item only-mobile" onClick={() => setOpen(false)}>
              <IconReport size={16} />گزارش کامل
            </Link>
          )}
          <Link href="/settings" className="um-item only-mobile" onClick={() => setOpen(false)}>
            <IconSettings size={16} />تعریف‌ها
          </Link>

          <div className="um-section">نمایش</div>
          <div className="um-theme">
            <button className={!dark ? 'active' : ''} onClick={() => switchTheme(false)}>
              <IconSun size={15} />روشن{!dark && <IconCheck size={13} />}
            </button>
            <button className={dark ? 'active' : ''} onClick={() => switchTheme(true)}>
              <IconMoon size={15} />تیره{dark && <IconCheck size={13} />}
            </button>
          </div>

          <button className="um-item" onClick={() => { setOpen(false); setPwOpen(true); }}>
            <IconAlert size={16} />{hasPw === false ? 'تعیین رمز عبور' : 'تغییر رمز عبور'}
          </button>

          <button className="um-item danger" onClick={() => { setOpen(false); void store.signOut(); }}>
            <IconLogout size={16} />خروج از حساب
          </button>
        </div>
      )}

      {pwOpen && (
        <PasswordDialog hasPassword={hasPw ?? false}
          onDone={() => { setHasPw(true); setPwOpen(false); }}
          onClose={() => setPwOpen(false)} />
      )}
    </div>
  );
}
