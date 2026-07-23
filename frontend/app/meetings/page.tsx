'use client';
import React, { useMemo, useState } from 'react';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { useReveal } from '@/components/useReveal';
import {
  categories, categoryById, rooms, people, guests, dayNames, dayNums, TODAY, toFa, normalizeFa,
} from '@/lib/data';
import type { Meeting } from '@/lib/types';
import { IconSearch, IconX, IconList } from '@/components/Icons';

export default function MeetingsPage() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');

  // searchable text per meeting (title, category, location, participants, guests, agenda, minutes)
  const haystack = useMemo(() => {
    const map: Record<string, string> = {};
    store.visibleMeetings.forEach((m) => {
      const parts = [
        m.title,
        categoryById(m.category).name,
        rooms[m.room]?.name ?? '',
        ...m.parts.map((p) => people[p]?.name ?? ''),
        ...m.guests.map((g) => `${guests[g]?.name ?? ''} ${guests[g]?.org ?? ''}`),
        ...m.agenda.map((a) => a.title),
        ...(store.minutes[m.id] ?? []).map((x) => x.text),
      ];
      map[m.id] = normalizeFa(parts.join(' '));
    });
    return map;
  }, [store.visibleMeetings, store.minutes]);

  const nq = normalizeFa(q);
  const rows = store.visibleMeetings
    .filter((m) => (cat === 'all' || m.category === cat) && (!nq || haystack[m.id].includes(nq)))
    .sort((a, b) => a.day - b.day || a.start - b.start);

  // group by day
  const groups: { day: number; items: Meeting[] }[] = [];
  rows.forEach((m) => {
    let g = groups.find((x) => x.day === m.day);
    if (!g) { g = { day: m.day, items: [] }; groups.push(g); }
    g.items.push(m);
  });

  const scope = useReveal(['.page-head', '.searchbar', '.filters', '.date-group', '.mrow']);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>همهٔ جلسات</h1>
        <p>جستجو در عنوان، مهمان، محل، دستورجلسه و صورت‌جلسه — یا فیلتر بر اساس دسته.</p>
      </div>

      <div className="searchbar">
        <IconSearch size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی جلسه…" />
        {q && <button className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
      </div>

      <div className="filters">
        <button className={'chip-btn' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}>همه</button>
        {Object.values(categories).map((c) => (
          <button key={c.id} className={'chip-btn' + (cat === c.id ? ' active' : '')} onClick={() => setCat(c.id)}>
            <span className="cdot" style={{ background: c.color }} />{c.name}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="result-empty"><div><IconList size={40} /></div>جلسه‌ای با این فیلتر/جستجو پیدا نشد.</div>
      ) : (
        groups.map((g) => (
          <div key={g.day}>
            <div className="date-group">
              <h3>{dayNames[g.day]}</h3>
              <span className="dnum num">{dayNums[g.day]} تیر</span>
              {g.day === TODAY && <span className="today-b">امروز</span>}
              <span className="cnt num">{toFa(g.items.length)} جلسه</span>
            </div>
            <div className="mlist">
              {g.items.map((m) => <MeetingRow key={m.id} m={m} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
