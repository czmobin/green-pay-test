'use client';
import React from 'react';
import { toFa, todayISO, isoToDate } from '@/lib/data';

/** فاصلهٔ روزها بین امروز و یک تاریخ ISO — منفی یعنی گذشته. */
function daysUntil(iso: string): number {
  const a = isoToDate(todayISO()).getTime();
  const b = isoToDate(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * مهلت باقی‌مانده به روز.
 * چیزی که کاربر واقعاً می‌خواهد بداند «چند روز مانده» است، نه خودِ تاریخ؛
 * پس همین را برجسته می‌کنیم و رنگش با نزدیک‌شدن مهلت هشداردهنده‌تر می‌شود.
 */
export default function DueBadge({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  const tone = d < 0 ? 'late' : d === 0 ? 'today' : d <= 2 ? 'soon' : 'ok';
  const label =
    d < 0 ? `${toFa(-d)} روز گذشته`
      : d === 0 ? 'امروز'
        : d === 1 ? 'فردا'
          : `${toFa(d)} روز مانده`;

  return <span className={`due-badge ${tone}`}>{label}</span>;
}
