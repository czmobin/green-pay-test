'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { toFa } from '@/lib/data';
import { IconUser, IconUsers, IconStar, IconShare, IconChevron } from './Icons';

/**
 * جابه‌جایی بین «جلسه‌های من»، «مدیرعامل»، «تقویم‌های اشتراکی» و «همه».
 *
 * پیش‌فرض: ادمین «همه»، بقیه «من» — انتخاب کاربر ذخیره می‌شود.
 *
 * سه تب مشروط‌اند و هرکدام دلیل خودش را دارد:
 *   • «مدیرعامل» فقط برای ادمین — خودِ مدیرعامل همان جلسه‌ها را زیر «من»
 *     می‌بیند و تبِ دوم برایش تکرار است.
 *   • «همه» فقط برای نقش‌های مدیریتی — کاربری که فقط گیرندهٔ یک اشتراک است
 *     نباید تبی ببیند که جلسه‌های کل سازمان را وعده می‌دهد و نمی‌آورد.
 *   • «اشتراکی» فقط وقتی کسی تقویمش را با این کاربر به اشتراک گذاشته باشد.
 *
 * با بیش از یک مبدأ، کلیکِ دومِ روی تبِ فعال فهرست انتخاب مبدأ را باز می‌کند؛
 * با یک مبدأ خودِ تب نام او را می‌گیرد و فهرستی لازم نیست.
 */
export default function ScopeSwitch() {
  const store = useStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const owners = store.sharedWithMe;
  const multi = owners.length > 1;
  const active = store.scope === 'shared';
  const selected = owners.find((o) => o.owner === store.sharedOwner);

  useEffect(() => {
    if (!pickerOpen) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [pickerOpen]);

  if (!store.canSwitchScope) return null;

  const sharedLabel = multi
    ? (selected ? selected.ownerName : 'تقویم‌های اشتراکی')
    : (owners[0]?.ownerName ?? 'تقویم اشتراکی');

  const pickShared = () => {
    if (active && multi) { setPickerOpen((v) => !v); return; }
    store.setScope('shared');
    setPickerOpen(false);
  };

  return (
    <div className="scope-sw" role="group" aria-label="دامنهٔ نمایش جلسات">
      <button className={store.scope === 'mine' ? 'on' : ''}
        onClick={() => store.setScope('mine')}
        title="فقط جلسه‌هایی که خودم در آن‌ها شرکت دارم (نه جلسه‌ای که صرفاً ساخته‌ام)">
        <IconUser size={15} /><span>جلسه‌های من</span>
        <b className="num">{toFa(store.mineCount)}</b>
      </button>

      {store.canSeeCeoScope && (
        <button className={store.scope === 'ceo' ? 'on' : ''}
          onClick={() => store.setScope('ceo')}
          title="فقط جلسه‌هایی که مدیرعامل در آن‌ها شرکت دارد">
          <IconStar size={15} /><span>مدیرعامل</span>
          <b className="num">{toFa(store.ceoCount)}</b>
        </button>
      )}

      {owners.length > 0 && (
        <div className="scope-shared" ref={box}>
          <button className={active ? 'on' : ''} onClick={pickShared}
            title="تقویم‌هایی که دیگران با شما به اشتراک گذاشته‌اند"
            aria-expanded={multi ? pickerOpen : undefined}>
            <IconShare size={15} /><span>{sharedLabel}</span>
            <b className="num">{toFa(store.sharedCount)}</b>
            {multi && <IconChevron size={13} className={pickerOpen ? 'flip' : ''} />}
          </button>

          {pickerOpen && multi && (
            <div className="scope-pop" role="listbox" aria-label="انتخاب تقویم">
              <button className={store.sharedOwner === null ? 'on' : ''}
                onClick={() => { store.setSharedOwner(null); setPickerOpen(false); }}>
                همهٔ تقویم‌ها
              </button>
              {owners.map((o) => (
                <button key={o.id} className={store.sharedOwner === o.owner ? 'on' : ''}
                  onClick={() => { store.setSharedOwner(o.owner); setPickerOpen(false); }}>
                  {o.ownerName}
                  {o.canWriteMinutes && <em>صورت‌جلسه</em>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {store.canSeeAllScope && (
        <button className={store.scope === 'all' ? 'on' : ''}
          onClick={() => store.setScope('all')}
          title="جلسه‌های همهٔ افراد سازمان">
          <IconUsers size={15} /><span>همه</span>
          <b className="num">{toFa(store.liveCount)}</b>
        </button>
      )}
    </div>
  );
}
