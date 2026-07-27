'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { initials } from '@/lib/data';
import { IconSun, IconMoon, IconLogout, IconCheck } from './Icons';

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
  const wrap = useRef<HTMLDivElement>(null);
  const me = store.me ?? store.people[store.currentUser];

  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-theme');
    setDark(cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme:dark)').matches);
  }, []);

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

          <div className="um-section">نمایش</div>
          <div className="um-theme">
            <button className={!dark ? 'active' : ''} onClick={() => switchTheme(false)}>
              <IconSun size={15} />روشن{!dark && <IconCheck size={13} />}
            </button>
            <button className={dark ? 'active' : ''} onClick={() => switchTheme(true)}>
              <IconMoon size={15} />تیره{dark && <IconCheck size={13} />}
            </button>
          </div>

          <button className="um-item danger" onClick={() => { setOpen(false); void store.signOut(); }}>
            <IconLogout size={16} />خروج از حساب
          </button>
        </div>
      )}
    </div>
  );
}
