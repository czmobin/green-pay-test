'use client';
import React from 'react';
import { toFa } from '@/lib/data';
import { IconClock } from './Icons';

/**
 * انتخاب ساعت — دو فهرست کشویی: ساعت و دقیقه.
 *
 * پیش‌تر از `input[type=time]` بومی استفاده می‌شد، ولی قالبش را مرورگر از
 * زبان سیستم می‌گیرد و روی خیلی از دستگاه‌ها AM/PM نشان می‌داد؛ هیچ راه
 * استانداردی هم برای اجبار به ۲۴ساعته نیست. با دو select، قالب همیشه
 * ۲۴ساعته است، ارقام فارسی‌اند و روی موبایل هم چرخ بومی باز می‌شود.
 *
 * مقدار داخلی برنامه ساعت اعشاری است (۱۴:۳۰ → ۱۴.۵).
 */
export default function TimePicker({
  value, onChange, id, step = 300,
}: { value: number; onChange: (v: number) => void; id?: string; step?: number }) {
  const stepMin = Math.max(1, Math.round(step / 60));
  const hour = Math.min(23, Math.max(0, Math.floor(value)));
  // دقیقه روی نزدیک‌ترین پلهٔ مجاز می‌نشیند تا مقدار خارج از فهرست نماند
  const rawMin = Math.round((value - Math.floor(value)) * 60);
  const minute = Math.min(59, Math.round(rawMin / stepMin) * stepMin);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / stepMin) }, (_, i) => i * stepMin);

  const set = (h: number, m: number) => onChange(h + m / 60);
  const two = (n: number) => toFa(String(n).padStart(2, '0'));

  return (
    <div className="tp">
      <IconClock size={15} />
      <select id={id} className="tp-sel num" value={hour} aria-label="ساعت"
        onChange={(e) => set(Number(e.target.value), minute)}>
        {hours.map((h) => <option key={h} value={h}>{two(h)}</option>)}
      </select>
      <b className="tp-sep">:</b>
      <select className="tp-sel num" value={minute} aria-label="دقیقه"
        onChange={(e) => set(hour, Number(e.target.value))}>
        {minutes.map((m) => <option key={m} value={m}>{two(m)}</option>)}
      </select>
    </div>
  );
}
