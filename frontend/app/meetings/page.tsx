'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { useReveal } from '@/components/useReveal';
import { categoryOf, toFa, normalizeFa, todayISO, addDaysISO, faDateShort, faWeekdayOf } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import MeetingFilters, { type FilterState } from '@/components/MeetingFilters';
import { IconSearch, IconX, IconList } from '@/components/Icons';

export default function MeetingsPage() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [filters, setFilters] = useState<FilterState>({ cats: [], time: 'all' });

  /**
   * ارتفاع نوار ابزار به یک متغیر CSS می‌رود تا سرصفحهٔ هر روز دقیقاً زیرش
   * بچسبد. با ثابت‌نوشتن این عدد، هر بار که تگ‌های فعال کم و زیاد شوند
   * سرصفحه‌ها روی نوار می‌افتادند.
   */
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = toolsRef.current;
    const host = el?.parentElement;          // نیای مشترکِ نوار ابزار و سرصفحه‌ها
    if (!el || !host) return;
    const apply = () => host.style.setProperty('--tools-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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


  /** تعداد جلسهٔ هر دسته — پایهٔ مرتب‌سازی و پنهان‌کردن دسته‌های خالی در فیلتر */
  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    store.visibleMeetings.forEach((m) => { map[m.category] = (map[m.category] ?? 0) + 1; });
    return map;
  }, [store.visibleMeetings]);

  const iso0 = todayISO();
  const weekEnd = addDaysISO(iso0, 7);
  const inTime = (m: Meeting) => {
    switch (filters.time) {
      case 'today': return m.date === iso0;
      case 'week': return m.date >= iso0 && m.date < weekEnd;
      case 'upcoming': return m.date >= iso0;
      case 'past': return m.date < iso0;
      default: return true;
    }
  };

  const rows = store.visibleMeetings
    .filter((m) => (filters.cats.length === 0 || filters.cats.includes(m.category))
      && (!dayFilter || m.date === dayFilter)
      && (!statusFilter || m.status === statusFilter)
      && inTime(m)
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

      {/* جستجو و فیلتر با هم می‌چسبند؛ ارتفاعشان به سرصفحهٔ روزها داده می‌شود */}
      <div className="mf-tools" ref={toolsRef}>
        <div className="search-row">
          <div className="searchbar">
            <IconSearch size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی جلسه…" />
            {q && <button className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
          </div>
        </div>

        <MeetingFilters
          categories={Object.values(store.categories)}
          counts={catCounts}
          value={filters}
          onChange={setFilters}
          resultCount={rows.length}
        />
      </div>

      {rows.length === 0 ? (
        <div className="result-empty">
          <div><IconList size={40} /></div>
          جلسه‌ای با این فیلتر پیدا نشد.
          {(filters.cats.length > 0 || filters.time !== 'all' || q || dayFilter || statusFilter) && (
            <button className="btn btn-ghost re-clear" onClick={() => {
              setFilters({ cats: [], time: 'all' }); setQ('');
              if (dayFilter || statusFilter) router.push('/meetings');
            }}>برداشتن فیلترها</button>
          )}
        </div>
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
