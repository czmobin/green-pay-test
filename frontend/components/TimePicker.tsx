'use client';
import React, { useRef } from 'react';
import { toFa } from '@/lib/data';
import { IconClock } from './Icons';

/**
 * انتخاب ساعت — ورودی زمانِ بومی مرورگر (چرخ ساعت در موبایل).
 * مقدار داخلی برنامه ساعت اعشاری است (۱۴:۳۰ → ۱۴.۵).
 */
const toHHMM = (v: number) => {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const fromHHMM = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
};

export default function TimePicker({
  value, onChange, id, step = 300,
}: { value: number; onChange: (v: number) => void; id?: string; step?: number }) {
  const ref = useRef<HTMLInputElement>(null);

  /** کلیک روی کل کادر، چرخ ساعتِ مرورگر را باز می‌کند (نه فقط آیکون کوچک). */
  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  };

  return (
    <div className="tp" onClick={openPicker}>
      <input
        id={id}
        ref={ref}
        type="time"
        className="field-in tp-in num"
        value={toHHMM(value)}
        step={step}
        onChange={(e) => { if (e.target.value) onChange(fromHHMM(e.target.value)); }}
      />
      <span className="tp-fa num" aria-hidden>
        <IconClock size={15} />{toFa(toHHMM(value))}
      </span>
    </div>
  );
}
