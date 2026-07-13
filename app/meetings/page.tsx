'use client';
import React, { useState } from 'react';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import type { MeetingType } from '@/lib/types';

const filters: { id: 'all' | MeetingType; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'board', label: 'هیئت مدیره' },
  { id: 'external', label: 'با مهمان خارجی' },
  { id: 'internal', label: 'داخلی' },
  { id: 'online', label: 'آنلاین' },
];

export default function MeetingsPage() {
  const store = useStore();
  const [f, setF] = useState<'all' | MeetingType>('all');
  const rows = store.meetings
    .filter((m) => f === 'all' || m.type === f)
    .sort((a, b) => a.day - b.day || a.start - b.start);

  return (
    <>
      <div className="page-head">
        <h1>همهٔ جلسات</h1>
        <p>{`${rows.length} جلسه در هفتهٔ جاری — برای دیدن جزئیات و صورت‌جلسه روی هرکدام بزنید.`}</p>
      </div>

      <div className="filters">
        {filters.map((x) => (
          <button key={x.id} className={'chip-btn' + (f === x.id ? ' active' : '')} onClick={() => setF(x.id)}>{x.label}</button>
        ))}
      </div>

      <div className="mlist">
        {rows.map((m) => <MeetingRow key={m.id} m={m} showDay />)}
      </div>
    </>
  );
}
