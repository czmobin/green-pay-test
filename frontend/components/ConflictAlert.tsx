'use client';
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from './store';
import { dayNames, fmtTime, toFa } from '@/lib/data';
import { IconX, IconClock, IconMapPin, IconChevron } from './Icons';

/**
 * هشدار تداخل زمانی: وقتی جلسه‌ای ساخته می‌شود و یکی از شرکت‌کنندگان
 * در همان بازه جلسهٔ دیگری دارد، این پاپ‌آپ کنار زنگولهٔ اعلان ظاهر می‌شود.
 * صرفاً اطلاع‌رسانی است — فرد از جلسه حذف نمی‌شود و چیزی لغو نمی‌شود.
 */
export default function ConflictAlert() {
  const store = useStore();
  const router = useRouter();
  const scope = useRef<HTMLDivElement>(null);
  const open = store.conflicts.length > 0;

  // بستن خودکار پس از مدتی (کاربر هم می‌تواند ببندد)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => store.dismissConflicts(), 14000);
    return () => clearTimeout(t);
  }, [open, store]);

  useGSAP(() => {
    if (!open) return;
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.cf-panel', {
        autoAlpha: 0, y: -12, scale: .97, duration: .38, ease: 'back.out(1.5)',
        clearProps: 'transform,opacity,visibility',
      });
      gsap.from('.cf-row', {
        autoAlpha: 0, x: 14, duration: .32, stagger: .06, delay: .1, ease: 'power3.out',
        clearProps: 'transform,opacity,visibility',
      });
    });
  }, { scope, dependencies: [open, store.conflicts.length] });

  if (!open) return null;

  // هر فرد ممکن است بیش از یک تداخل داشته باشد
  const names = Array.from(new Set(store.conflicts.map((c) => c.userName)));

  return (
    <div ref={scope}>
      <div className="cf-overlay" onClick={store.dismissConflicts} />
      <div className="cf-panel" role="alert">
        <div className="cf-head">
          <span className="cf-ic">!</span>
          <div>
            <b>تداخل زمانی</b>
            <small>
              {names.length === 1
                ? `${names[0]} در این بازه جلسهٔ دیگری دارد.`
                : `${toFa(names.length)} نفر از شرکت‌کنندگان در این بازه جلسهٔ دیگری دارند.`}
            </small>
          </div>
          <button className="cf-close" onClick={store.dismissConflicts} aria-label="بستن">
            <IconX size={15} />
          </button>
        </div>

        <div className="cf-list">
          {store.conflicts.map((c, i) => (
            <button className="cf-row" key={`${c.user}-${c.meeting}-${i}`}
              onClick={() => { store.dismissConflicts(); router.push(`/meetings/${c.meeting}`); }}>
              <div className="cf-body">
                <b>{c.userName}</b>
                <span className="cf-title">{c.meetingTitle}</span>
                <span className="cf-meta">
                  <span className="num"><IconClock size={11} />{dayNames[c.day] ?? ''} · {fmtTime(c.start)}–{fmtTime(c.end)}</span>
                  {c.room && <span><IconMapPin size={11} />{c.room}</span>}
                </span>
              </div>
              <IconChevron size={16} />
            </button>
          ))}
        </div>

        <div className="cf-foot">جلسه ساخته شد و شرکت‌کنندگان اضافه شدند؛ این فقط یک هشدار است.</div>
      </div>
    </div>
  );
}
