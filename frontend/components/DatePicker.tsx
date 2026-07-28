'use client';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toFa, isoToJ, faDate, todayISO } from '@/lib/data';
import {
  jMonths, jWeekdaysShort, jMonthLength, faWeekday, toGregorian, type JDate,
} from '@/lib/jalali';
import { IconCalendar, IconChevron, IconBack } from './Icons';

const isoOf = (j: JDate) => {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
};

const POP_W = 270;
const POP_H = 320;

/**
 * انتخاب تاریخ شمسی — تقویم ماهانه با پیمایش ماه.
 * مقدار ورودی/خروجی تاریخ میلادی ISO است (همان چیزی که API می‌خواهد).
 * تقویم روی body رندر می‌شود تا داخل مودالِ اسکرول‌دار بریده نشود.
 */
export default function DatePicker({
  value, onChange, id, min,
}: { value: string; onChange: (iso: string) => void; id?: string; min?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JDate>(() => isoToJ(value || todayISO()));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setView(isoToJ(value || todayISO())); }, [open, value]);

  /** تقویم را زیر دکمه می‌چسباند؛ اگر جا نبود بالای آن باز می‌شود. */
  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const pad = 10;
    const width = Math.min(POP_W, window.innerWidth - pad * 2);
    let left = r.right - width;                                   // هم‌ترازِ لبهٔ راستِ دکمه (RTL)
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
    const below = window.innerHeight - r.bottom;
    const top = below >= POP_H + pad || below >= r.top
      ? r.bottom + 6
      : Math.max(pad, r.top - POP_H - 6);
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  function shiftMonth(dir: number) {
    let jm = view.jm + dir, jy = view.jy;
    if (jm < 1) { jm = 12; jy--; }
    if (jm > 12) { jm = 1; jy++; }
    setView({ jy, jm, jd: 1 });
  }

  const offset = faWeekday(view.jy, view.jm, 1);
  const len = jMonthLength(view.jy, view.jm);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: len }, (_, i) => i + 1),
  ];
  const today = todayISO();

  const panel = (
    <div className="dp-pop" ref={pop} dir="rtl"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      <div className="dp-head">
        <button type="button" className="dp-nav" onClick={() => shiftMonth(-1)} aria-label="ماه قبل">
          <IconBack size={15} />
        </button>
        <b>{jMonths[view.jm - 1]} {toFa(view.jy)}</b>
        <button type="button" className="dp-nav" onClick={() => shiftMonth(1)} aria-label="ماه بعد">
          <IconChevron size={15} />
        </button>
      </div>

      <div className="dp-wd">{jWeekdaysShort.map((w, i) => <span key={i}>{w}</span>)}</div>

      <div className="dp-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = isoOf({ jy: view.jy, jm: view.jm, jd: d });
          const disabled = min ? iso < min : false;
          return (
            <button type="button" key={i} disabled={disabled}
              className={'dp-day' + (iso === value ? ' sel' : '') + (iso === today ? ' today' : '')}
              onClick={() => { onChange(iso); setOpen(false); }}>
              {toFa(d)}
            </button>
          );
        })}
      </div>

      <div className="dp-foot">
        <button type="button" onClick={() => { onChange(today); setOpen(false); }}>امروز</button>
      </div>
    </div>
  );

  return (
    <div className="dp">
      <button type="button" id={id} ref={trigger} className="field-in dp-trigger"
        onClick={() => setOpen((v) => !v)}>
        <IconCalendar size={16} />
        <span>{value ? faDate(value, true) : 'انتخاب تاریخ'}</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
}
