'use client';
/**
 * رزرو محل‌ها — نمای **فقط‌خواندنی** وضعیت اتاق‌ها.
 *
 * چرا صفحهٔ جدا و نه یک نمای پنجم در `Calendar`
 * ==============================================
 *
 * بقیهٔ نماها از `store.visibleMeetings` می‌خوانند، یعنی فقط جلسه‌هایی که
 * کاربر حق دیدنشان را دارد. این نما عمداً فراتر می‌رود: **ساعت و محل همهٔ
 * جلسه‌ها** را نشان می‌دهد تا کسی اتاقی را که پر است دوباره رزرو نکند — ولی
 * **عنوان** فقط برای جلسه‌هایی می‌آید که از قبل دیدنی بودند. بقیه «جلسهٔ دیگر»
 * می‌شوند. این تصمیم سمتِ سرور گرفته می‌شود (`/api/room-bookings/`) و این‌جا
 * فقط نمایش داده می‌شود؛ عنوانِ پنهان هیچ‌وقت به مرورگر نمی‌رسد.
 *
 * شبکه از `WeekView`/`DayView` خودِ تقویم می‌آید، نه یک کپی: هر دو
 * `meetingsOn` و `color` و `open` را پراپ می‌گیرند، پس با دادهٔ دیگر و با
 * کلیکِ بی‌اثر هم کار می‌کنند — و ریاضیِ جای بلوک‌ها در یک جا می‌ماند.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { DayView, WeekView } from '@/components/Calendar';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { api, type RoomBooking } from '@/lib/api';
import { isoToJ, toFa, faDateLabel } from '@/lib/data';
import { addDays, dateToJ, jToDate, jWeekdays, type JDate } from '@/lib/jalali';
import type { Meeting } from '@/lib/types';
import { IconBack, IconChevron } from '@/components/Icons';

export const dynamic = 'force-dynamic';

type View = 'week' | 'day';

/** شنبهٔ هفتهٔ این تاریخ. */
const saturdayOf = (j: JDate): Date => {
  const d = jToDate(j.jy, j.jm, j.jd);
  return addDays(d, -((d.getUTCDay() + 1) % 7));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * رزرو → شکلی که `DayView`/`WeekView` می‌فهمند.
 *
 * فیلدهایی که آن دو نما واقعاً می‌خوانند اینهاست: `id`، `title`، `date`،
 * `start`، `end`، `room` و `status`. بقیه برای راضی‌کردن تایپ خالی پر
 * می‌شوند — این یک view-model است، نه جلسهٔ واقعی. اگر روزی آن نماها فیلد
 * تازه‌ای خواندند، همین‌جا هم باید اضافه شود.
 */
function asMeeting(b: RoomBooking, i: number): Meeting {
  return {
    id: b.meeting || `hidden-${i}`,
    title: b.title,
    type: 'in_person',
    category: '',
    status: b.status,
    priority: 'normal',
    date: b.date,
    start: b.start,
    end: b.end,
    room: b.room,
    organizer: '',
    parts: [],
    guests: [],
    agenda: [],
  };
}

export default function RoomsPage() {
  const store = useStore();
  const [view, setView] = useState<View>('week');
  const [cur, setCur] = useState<JDate>(() => isoToJ(new Date().toISOString().slice(0, 10)));
  const [room, setRoom] = useState('');
  const [rows, setRows] = useState<RoomBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useReveal(['.page-head', '.cal-switch', '.cal-toolbar', '.cal-view']);

  // بازهٔ درخواست: کلِ هفته برای نمای هفته، یک روز برای نمای روز.
  const range = useMemo(() => {
    if (view === 'day') {
      const d = iso(jToDate(cur.jy, cur.jm, cur.jd));
      return { from: d, to: d };
    }
    const sat = saturdayOf(cur);
    return { from: iso(sat), to: iso(addDays(sat, 6)) };
  }, [view, cur]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.roomBookings({ ...range, room: room || undefined })
      .then((data) => { if (alive) setRows(data); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range, room]);

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    rows.forEach((b, i) => {
      const list = map.get(b.date) ?? [];
      list.push(asMeeting(b, i));
      map.set(b.date, list);
    });
    return map;
  }, [rows]);

  const meetingsOn = (j: JDate): Meeting[] => {
    const key = iso(jToDate(j.jy, j.jm, j.jd));
    return (byDay.get(key) ?? []).slice().sort((a, b) => a.start - b.start);
  };

  /**
   * رنگ بر اساس **محل**، نه دسته — این نما دربارهٔ اتاق است.
   *
   * جلسهٔ پنهان (`id` خالی‌شده) خاکستری می‌شود: باید عمدی به نظر برسد نه
   * خراب، چون برای کاربر عادی حالتِ غالب است.
   */
  const palette = ['#2563EB', '#0E9488', '#B45309', '#7C3AED', '#BE185D', '#4D7C0F', '#0369A1'];
  const roomIds = useMemo(() => Object.keys(store.rooms).sort(), [store.rooms]);
  const color = (m: Meeting) => {
    if (m.id.startsWith('hidden-')) return 'var(--muted)';
    const idx = roomIds.indexOf(m.room);
    return palette[(idx < 0 ? 0 : idx) % palette.length];
  };

  const nav = (step: number) => {
    const d = jToDate(cur.jy, cur.jm, cur.jd);
    setCur(dateToJ(addDays(d, step * (view === 'week' ? 7 : 1))));
  };

  const title = view === 'day'
    ? `${jWeekdays[(jToDate(cur.jy, cur.jm, cur.jd).getUTCDay() + 1) % 7]} ${faDateLabel(iso(jToDate(cur.jy, cur.jm, cur.jd)))}`
    : `هفتهٔ ${faDateLabel(range.from)} تا ${faDateLabel(range.to)}`;

  const hidden = rows.filter((r) => !r.meeting).length;

  return (
    <div className="cal">
      <div className="page-head">
        <h1>رزرو محل‌ها</h1>
        <p>
          این نما فقط برای دیدنِ وضعیتِ رزرو است و کلیک روی جلسه‌ها کاری نمی‌کند.
          {hidden > 0 && ` عنوانِ ${toFa(hidden)} جلسه برای شما نمایش داده نمی‌شود، ولی ساعتشان رزرو است.`}
        </p>
      </div>

      <div className="cal-switch">
        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>روز</button>
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>هفته</button>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="arw" onClick={() => nav(-1)} aria-label="قبلی"><IconBack size={18} /></button>
          <button className="today-btn"
            onClick={() => setCur(isoToJ(new Date().toISOString().slice(0, 10)))}>امروز</button>
          <button className="arw" onClick={() => nav(1)} aria-label="بعدی"><IconChevron size={18} /></button>
        </div>
        <h3 className="cal-title">{title}</h3>
        <span className="spacer" />
        <select className="field-in rm-pick" value={room} aria-label="محل جلسه"
          onChange={(e) => setRoom(e.target.value)}>
          <option value="">همهٔ محل‌ها</option>
          {Object.values(store.rooms)
            .filter((r) => !r.is_online)
            .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      <div className="cal-view">
        {loading && rows.length === 0 ? (
          <div className="boot"><span className="boot-spin" />در حال خواندن رزروها…</div>
        ) : view === 'day' ? (
          <DayView j={cur} meetingsOn={meetingsOn} open={() => {}} color={color} />
        ) : (
          <WeekView cur={cur} meetingsOn={meetingsOn} open={() => {}} onDay={(j) => { setCur(j); setView('day'); }} color={color} />
        )}
      </div>
    </div>
  );
}
