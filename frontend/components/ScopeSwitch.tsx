'use client';
import React from 'react';
import { useStore } from './store';
import { toFa } from '@/lib/data';
import { IconUser, IconUsers } from './Icons';

/**
 * جابه‌جایی بین «جلسه‌های من» و «جلسه‌های همه».
 * فقط برای ادمین و مدیرعامل دیده می‌شود؛ کاربر عادی همیشه فقط جلسه‌های خودش را می‌بیند.
 * پیش‌فرض: ادمین «همه»، مدیرعامل «من» — انتخاب کاربر ذخیره می‌شود.
 */
export default function ScopeSwitch() {
  const store = useStore();
  if (!store.canSwitchScope) return null;

  return (
    <div className="scope-sw" role="group" aria-label="دامنهٔ نمایش جلسات">
      <button className={store.scope === 'mine' ? 'on' : ''}
        onClick={() => store.setScope('mine')}
        title="فقط جلسه‌هایی که خودم در آن‌ها شرکت دارم (نه جلسه‌ای که صرفاً ساخته‌ام)">
        <IconUser size={15} /><span>جلسه‌های من</span>
        <b className="num">{toFa(store.mineCount)}</b>
      </button>
      <button className={store.scope === 'all' ? 'on' : ''}
        onClick={() => store.setScope('all')}
        title="جلسه‌های همهٔ افراد سازمان">
        <IconUsers size={15} /><span>همه</span>
        <b className="num">{toFa(store.meetings.length)}</b>
      </button>
    </div>
  );
}
