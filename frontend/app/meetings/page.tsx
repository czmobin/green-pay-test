'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { useReveal } from '@/components/useReveal';
import { categoryOf, toFa, normalizeFa, todayISO, nowHour, addDaysISO, faDateShort, faWeekdayOf } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import MeetingFilters, { EMPTY_FILTERS, activeCount, type FilterState } from '@/components/MeetingFilters';
import { IconSearch, IconX, IconList } from '@/components/Icons';

export default function MeetingsPage() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

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

    // وقتی نوار ابزار چسبیده و محتوایی زیرش می‌گذرد، یک خط نازک مرزش را نشان دهد
    const scroller = el.closest('.content');
    const onScroll = () => el.classList.toggle('stuck', (scroller?.scrollTop ?? 0) > 4);
    onScroll();
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); scroller?.removeEventListener('scroll', onScroll); };
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
      case 'range': return (!filters.from || m.date >= filters.from)
        && (!filters.to || m.date <= filters.to);
      default: return true;
    }
  };

  /**
   * ترتیب از جدید به قدیم: جلسه‌های دورترِ آینده بالا، گذشته پایین‌تر.
   * چون نزدیک‌ترین جلسهٔ آینده وسطِ فهرست می‌افتد، پایین‌تر خودکار همان‌جا
   * اسکرول می‌شود تا کاربر اول همان را ببیند.
   */
  const rows = store.visibleMeetings
    .filter((m) => (filters.cats.length === 0 || filters.cats.includes(m.category))
      && (filters.type === 'all' || m.type === filters.type)
      && (!dayFilter || m.date === dayFilter)
      && (!statusFilter || store.myResponse(m) === statusFilter)
      && inTime(m)
      && (!nq || haystack[m.id].includes(nq)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.start - b.start);

  // group by day
  const groups: { date: string; items: Meeting[] }[] = [];
  rows.forEach((m) => {
    let g = groups.find((x) => x.date === m.date);
    if (!g) { g = { date: m.date, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  const iso = todayISO();
  const tomorrow = addDaysISO(iso, 1);

  /**
   * لنگرِ اسکرول خودکار: نخستین جلسهٔ همان روزی که نزدیک‌ترین جلسهٔ پیشِ رو
   * در آن است. با تکیه بر خودِ آن جلسه، اگر روز چند جلسه داشت کاربر وسط یا
   * ته روز فرود می‌آمد و جلسه‌های قبلیِ همان روز را نمی‌دید.
   */
  const anchorId = useMemo(() => {
    const hour = nowHour();
    const upcoming = rows.filter((m) => m.date > iso || (m.date === iso && m.end > hour));
    if (!upcoming.length) return '';
    const day = upcoming[upcoming.length - 1].date;   // نزدیک‌ترین روزِ پیشِ رو
    return rows.find((m) => m.date === day)?.id ?? '';
  }, [rows, iso]);

  /**
   * یک‌بار در هر ورود به صفحه روی همان جلسه می‌رویم؛ سرصفحهٔ روز و نوار ابزار
   * چسبان‌اند، پس به‌اندازهٔ ارتفاعشان بالاتر می‌ایستیم تا رویش نیفتند.
   *
   * وقتی کاربر خودش جستجو یا فیلتری از داشبورد آورده، نتیجه باید از بالا
   * دیده شود؛ پرش خودکار آنجا گیج‌کننده است.
   */
  const scrolledTo = useRef('');
  const jump = !nq && !dayFilter && !statusFilter;
  useEffect(() => {
    if (!jump || !anchorId || scrolledTo.current === anchorId) return;
    const el = document.querySelector(`[data-mid="${anchorId}"]`);
    const block = el?.closest('.day-block');
    const scroller = el?.closest('.content') as HTMLElement | null;
    if (!el || !block || !scroller) return;
    scrolledTo.current = anchorId;
    const pad = (toolsRef.current?.offsetHeight ?? 0) + 12;
    scroller.scrollTop += block.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top - pad;
  }, [anchorId, jump]);

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
          {(activeCount(filters) > 0 || q || dayFilter || statusFilter) && (
            <button className="btn btn-ghost re-clear" onClick={() => {
              setFilters(EMPTY_FILTERS); setQ('');
              if (dayFilter || statusFilter) router.push('/meetings');
            }}>پاک کردن فیلترها</button>
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
              {g.items.map((m) => (
                <div key={m.id} data-mid={m.id}><MeetingRow m={m} /></div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
