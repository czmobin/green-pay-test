'use client';
import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { useReveal } from '@/components/useReveal';
import { categoryOf, toFa, normalizeFa, todayISO, addDaysISO, faDateShort, faWeekdayOf } from '@/lib/data';
import type { Meeting } from '@/lib/types';

type TimeF = 'all' | 'upcoming' | 'past';
import { IconSearch, IconX, IconList, IconFilter } from '@/components/Icons';

export default function MeetingsPage() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [cat, setCat] = useState<string>('all');
  const [time, setTime] = useState<TimeF>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // searchable text per meeting (title, category, location, participants, guests, agenda, minutes)
  const haystack = useMemo(() => {
    const map: Record<string, string> = {};
    store.visibleMeetings.forEach((m) => {
      const parts = [
        m.title,
        categoryOf(store.categories, m.category).name,
        store.rooms[m.room]?.name ?? '',
        ...m.parts.map((p) => store.people[p]?.name ?? ''),
        ...m.guests.map((g) => `${store.guests[g]?.name ?? ''} ${store.guests[g]?.org ?? ''}`),
        ...m.agenda.map((a) => a.title),
        ...(store.minutes[m.id] ?? []).map((x) => x.text),
      ];
      map[m.id] = normalizeFa(parts.join(' '));
    });
    return map;
  }, [store.visibleMeetings, store.minutes, store.categories, store.rooms, store.people, store.guests]);

  const nq = normalizeFa(q);
  // فیلترهای آمده از داشبورد: روز مشخص یا فقط دعوت‌های بی‌پاسخ
  const dayFilter = params.get('day');
  const statusFilter = params.get('status');
  const activeFilters = (cat !== 'all' ? 1 : 0) + (time !== 'all' ? 1 : 0)
    + (dayFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  const rows = store.visibleMeetings
    .filter((m) => (cat === 'all' || m.category === cat)
      && (!dayFilter || m.date === dayFilter)
      && (!statusFilter || m.status === statusFilter)
      && (time === 'all' || (time === 'upcoming' ? m.date >= todayISO() : m.date < todayISO()))
      && (!nq || haystack[m.id].includes(nq)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  // group by day
  const groups: { date: string; items: Meeting[] }[] = [];
  rows.forEach((m) => {
    let g = groups.find((x) => x.date === m.date);
    if (!g) { g = { date: m.date, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  const iso = todayISO();
  const tomorrow = addDaysISO(iso, 1);

  const scope = useReveal(['.page-head', '.searchbar', '.filters', '.date-group', '.mrow']);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>{
          statusFilter === 'pending' ? 'در انتظار تأیید'
            : dayFilter ? `جلسه‌های ${faWeekdayOf(dayFilter)} ${faDateShort(dayFilter)}`
              : store.canSwitchScope && store.scope === 'mine' ? 'جلسه‌های من' : 'همهٔ جلسات'
        }</h1>
        <p>جستجو در عنوان، مهمان، محل، دستورجلسه و صورت‌جلسه — یا فیلتر بر اساس دسته.</p>
        {store.canSwitchScope && (
          <p className="scope-hint">
            {store.scope === 'mine'
              ? <>نمایش <b className="num">{toFa(store.mineCount)}</b> جلسه از <b className="num">{toFa(store.meetings.length)}</b> جلسهٔ سازمان — آن‌هایی که خودتان در آن‌ها شرکت دارید.</>
              : <>نمایش هر <b className="num">{toFa(store.meetings.length)}</b> جلسهٔ سازمان.</>}
            {store.mineCount === store.meetings.length && store.meetings.length > 0 && (
              <> شما در همهٔ جلسه‌ها حضور دارید، پس دو حالت این کلید یکی است.</>
            )}
          </p>
        )}
      </div>

      {(dayFilter || statusFilter) && (
        <button className="filter-clear" onClick={() => router.push('/meetings')}>
          <IconX size={14} />برداشتن فیلتر و دیدن همهٔ جلسات
        </button>
      )}

      <div className="search-row">
        <div className="searchbar">
          <IconSearch size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی جلسه…" />
          {q && <button className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
        </div>
        {/* فیلترها پشت یک آیکون جمع شده‌اند تا بالای صفحه با ردیف تگ‌ها پر نشود
            و جا برای فیلترهای بعدی باز بماند */}
        <button className={'filter-btn' + (activeFilters > 0 ? ' on' : '')}
          onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-label="فیلترها">
          <IconFilter size={18} />
          {activeFilters > 0 && <span className="fb-dot num">{toFa(activeFilters)}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className="filter-panel">
          <div className="fp-row">
            <span className="fp-lbl">دسته‌بندی</span>
            <div className="filters">
              <button className={'chip-btn' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}>همه</button>
              {Object.values(store.categories).map((c) => (
                <button key={c.id} className={'chip-btn' + (cat === c.id ? ' active' : '')} onClick={() => setCat(c.id)}>
                  <span className="cdot" style={{ background: c.color }} />{c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="fp-row">
            <span className="fp-lbl">زمان</span>
            <div className="filters">
              {([['all', 'همه'], ['upcoming', 'پیشِ رو'], ['past', 'گذشته']] as [TimeF, string][]).map(([id, lbl]) => (
                <button key={id} className={'chip-btn' + (time === id ? ' active' : '')} onClick={() => setTime(id)}>{lbl}</button>
              ))}
            </div>
          </div>

          {activeFilters > 0 && (
            <button className="fp-clear" onClick={() => { setCat('all'); setTime('all'); router.push('/meetings'); }}>
              برداشتن همهٔ فیلترها
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="result-empty"><div><IconList size={40} /></div>جلسه‌ای با این فیلتر/جستجو پیدا نشد.</div>
      ) : (
        groups.map((g) => (
          <section className={'day-block' + (g.date === iso ? ' is-today' : '')} key={g.date}>
            <div className="date-group">
              <span className="dg-day">{faWeekdayOf(g.date)}</span>
              <h3>{faDateShort(g.date)}</h3>
              {g.date === iso && <span className="today-b">امروز</span>}
              {g.date === tomorrow && <span className="tmr-b">فردا</span>}
              <span className="cnt num">{toFa(g.items.length)} جلسه</span>
            </div>
            <div className="mlist">
              {g.items.map((m) => <MeetingRow key={m.id} m={m} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
