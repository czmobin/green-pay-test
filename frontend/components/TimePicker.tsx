'use client';
import React from 'react';
import { toFa } from '@/lib/data';
import { IconClock } from './Icons';

/**
 * انتخاب ساعت — دو فهرست کشویی: ساعت و دقیقه.
 *
 * `input[type=time]` بومی قالبش را از زبان سیستم می‌گیرد و روی خیلی از
 * دستگاه‌ها AM/PM نشان می‌داد؛ راه استانداردی هم برای اجبار به ۲۴ساعته نیست.
 *
 * خودِ کادر ltr است تا مثل هر ساعتی خوانده شود — ساعت سمت چپ، دقیقه سمت
 * راست — و زیر هرکدام نامش نوشته شده تا با هم اشتباه گرفته نشوند.
 *
 * چیدمان یک گرید دوردیفه است، نه چند ستونِ کنار هم: ردیف بالا مقدارها و
 * ردیف پایین برچسب‌ها. با ستون‌های جدا، دونقطه باید با یک `margin-top`
 * حدسی هم‌تراز عددها می‌شد و با هر تغییر اندازهٔ قلم از تراز درمی‌آمد.
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
      {/* گرید: ردیف اول مقدارها، ردیف دوم برچسب‌ها — ترتیب DOM همان چیدمان است */}
      <div className="tp-grid">
        <select id={id} className="tp-sel num" value={hour} aria-label="ساعت"
          onChange={(e) => set(Number(e.target.value), minute)}>
          {hours.map((h) => <option key={h} value={h}>{two(h)}</option>)}
        </select>
        <b className="tp-sep" aria-hidden>:</b>
        <select className="tp-sel num" value={minute} aria-label="دقیقه"
          onChange={(e) => set(hour, Number(e.target.value))}>
          {minutes.map((m) => <option key={m} value={m}>{two(m)}</option>)}
        </select>

        <small>ساعت</small>
        <span />
        <small>دقیقه</small>
      </div>

      <IconClock size={15} />
    </div>
  );
}
