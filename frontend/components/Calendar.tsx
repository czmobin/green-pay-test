'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Portal from './Portal';
import { useSheet } from './useSheet';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReveal } from './useReveal';
import { useStore } from './store';
import { meetingColor, fmtTime, toFa, todayISO, nowHour, isoToJ } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import {
  jMonths, jWeekdays, jWeekdaysShort, jMonthLength, faWeekday, jToDate, dateToJ, addDays, sameJ,
  toGregorian, type JDate,
} from '@/lib/jalali';
import { IconChevron, IconBack, IconX } from './Icons';

type View = 'day' | 'week' | 'month' | 'year';
// روز از ۶ صبح تا نیمه‌شب — جلسهٔ ۷ صبح هم باید دیده شود
const START = 6, END = 24, HOUR = 48;

/** امروز به تاریخ شمسی و ساعت جاری — واقعی، نه لنگر ثابت */
const todayJ = (): JDate => isoToJ(todayISO());
const isoOf = (j: JDate): string => {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
};

export default function Calendar() {
  const store = useStore();
  const router = useRouter();
  // نمای اولیه از نشانی می‌آید (مثلاً لینک «تقویم هفته» در داشبورد)
  const params = useSearchParams();
  const initialView = ((): View => {
    const v = params.get('view');
    return v === 'day' || v === 'week' || v === 'month' || v === 'year' ? v : 'month';
  })();
  const [view, setView] = useState<View>(initialView);
  const [cur, setCur] = useState<JDate>(todayJ);

  /** جلسات یک روز — مقایسه بر اساس تاریخ میلادی ISO که از API می‌آید */
  const meetingsOn = (j: JDate): Meeting[] =>
    store.visibleMeetings.filter((m) => m.date === isoOf(j)).sort((a, b) => a.start - b.start);

  const open = (id: string) => router.push(`/meetings/${id}`);
  const [overlap, setOverlap] = useState<Meeting[] | null>(null);

  /**
   * روی رویدادِ تقویم: اگر جلسهٔ دیگری با آن هم‌پوشانی زمانی دارد، به‌جای رفتن
   * مستقیم، فهرست هم‌پوشان‌ها را نشان می‌دهیم — وگرنه کاربر نمی‌فهمد زیر آن
   * کادر چند جلسهٔ دیگر پنهان است.
   */
  const openEvent = (m: Meeting, sameDay: Meeting[]) => {
    const clash = sameDay.filter((x) => x.start < m.end && x.end > m.start);
    if (clash.length > 1) setOverlap(clash.sort((a, b) => a.start - b.start));
    else open(m.id);
  };
  // رنگ هر جلسه از دستهٔ خودش می‌آید، نه از حضوری/آنلاین بودن
  const color = (m: Meeting) => meetingColor(store.categories, m);

  /* ---------- navigation ---------- */
  function nav(dir: number) {
    if (view === 'day') setCur(dateToJ(addDays(jToDate(cur.jy, cur.jm, cur.jd), dir)));
    else if (view === 'week') setCur(dateToJ(addDays(jToDate(cur.jy, cur.jm, cur.jd), 7 * dir)));
    else if (view === 'month') {
      let jm = cur.jm + dir, jy = cur.jy;
      if (jm < 1) { jm = 12; jy--; } if (jm > 12) { jm = 1; jy++; }
      setCur({ jy, jm, jd: Math.min(cur.jd, jMonthLength(jy, jm)) });
    } else setCur({ jy: cur.jy + dir, jm: cur.jm, jd: Math.min(cur.jd, jMonthLength(cur.jy + dir, cur.jm)) });
  }

  /* ---------- title ---------- */
  let title = '';
  if (view === 'day') title = `${jWeekdays[faWeekday(cur.jy, cur.jm, cur.jd)]} ${toFa(cur.jd)} ${jMonths[cur.jm - 1]} ${toFa(cur.jy)}`;
  else if (view === 'week') {
    const c = jToDate(cur.jy, cur.jm, cur.jd);
    const sat = dateToJ(addDays(c, -((c.getUTCDay() + 1) % 7)));
    const fri = dateToJ(addDays(jToDate(sat.jy, sat.jm, sat.jd), 6));
    title = sat.jm === fri.jm
      ? `${toFa(sat.jd)} – ${toFa(fri.jd)} ${jMonths[sat.jm - 1]} ${toFa(sat.jy)}`
      : `${toFa(sat.jd)} ${jMonths[sat.jm - 1]} – ${toFa(fri.jd)} ${jMonths[fri.jm - 1]}`;
  }
  else if (view === 'month') title = `${jMonths[cur.jm - 1]} ${toFa(cur.jy)}`;
  else title = `سال ${toFa(cur.jy)}`;

  const scope = useReveal(['.page-head', '.cal-switch', '.cal-toolbar', '.cal-view']);
  // جابه‌جایی نرم بین نماها و پیمایش تاریخ
  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.cal-view', { autoAlpha: 0, y: 14, duration: 0.35, ease: 'power3.out', clearProps: 'all' });
    });
  }, { scope, dependencies: [view, cur.jy, cur.jm, cur.jd] });

  return (
    <div ref={scope}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <h1>تقویم</h1>
        <p>نمای روزانه، هفتگی، ماهانه و سالانهٔ جلسات شما.</p>
      </div>

      <div className="cal-switch">
        {(['day', 'week', 'month', 'year'] as View[]).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {{ day: 'روز', week: 'هفته', month: 'ماه', year: 'سال' }[v]}
          </button>
        ))}
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="arw" onClick={() => nav(-1)} aria-label="قبلی"><IconBack size={18} /></button>
          <button className="today-btn" onClick={() => setCur(todayJ())}>امروز</button>
          <button className="arw" onClick={() => nav(1)} aria-label="بعدی"><IconChevron size={18} /></button>
        </div>
        <h3 className="cal-title">{title}</h3>
      </div>

      <div className="cal-view">
        {view === 'day' && <DayView j={cur} meetingsOn={meetingsOn} open={openEvent} color={color} />}
        {view === 'week' && <WeekView cur={cur} meetingsOn={meetingsOn} open={openEvent} color={color} onDay={(j) => { setCur(j); setView('day'); }} />}
        {view === 'month' && <MonthView cur={cur} meetingsOn={meetingsOn} color={color} onDay={(j) => { setCur(j); setView('day'); }} />}
        {overlap && (
          <OverlapDialog items={overlap} color={color} rooms={store.rooms}
            onPick={(id) => { setOverlap(null); open(id); }} onClose={() => setOverlap(null)} />
        )}
        {view === 'year' && <YearView jy={cur.jy} meetingsOn={meetingsOn} onMonth={(jm) => { setCur({ jy: cur.jy, jm, jd: 1 }); setView('month'); }} />}
      </div>
    </div>
  );
}

/* ===================== Day ===================== */
function DayView({ j, meetingsOn, open, color }: { j: JDate; meetingsOn: (j: JDate) => Meeting[]; open: (m: Meeting, sameDay: Meeting[]) => void; color: (m: Meeting) => string }) {
  const { rooms } = useStore();
  const items = meetingsOn(j);
  const isToday = sameJ(j, todayJ());
  return (
    <div className="cal-time">
      <div className="tgrid" style={{ gridTemplateColumns: '52px 1fr' }}>
        <div className="tc">
          {Array.from({ length: END - START }, (_, i) => <div className="hl num" key={i}>{toFa(START + i)}:۰۰</div>)}
        </div>
        <div className="dcol">
          {Array.from({ length: END - START }, (_, i) => <div className="slot" key={i} />)}
          {isToday && <div className="now-line" style={{ top: (nowHour() - START) * HOUR }} />}
          {items.map((m) => (
            <button key={m.id} className={'cev' + (items.some((x) => x.id !== m.id && x.start < m.end && x.end > m.start) ? ' clash' : '')}
              onClick={() => open(m, items)}
              style={{ top: (m.start - START) * HOUR, height: (m.end - m.start) * HOUR - 3, background: `color-mix(in srgb,${color(m)} 15%,var(--panel))`, borderColor: color(m), color: color(m) }}>
              <b>{m.title}</b>
              <small className="num">{fmtTime(m.start)} – {fmtTime(m.end)} · {rooms[m.room]?.name ?? ''}</small>
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 && <div className="cal-empty">جلسه‌ای در این روز نیست.</div>}
    </div>
  );
}

/* ===================== Week ===================== */
function WeekView({ cur, meetingsOn, open, onDay, color }: { cur: JDate; meetingsOn: (j: JDate) => Meeting[]; open: (m: Meeting, sameDay: Meeting[]) => void; onDay: (j: JDate) => void; color: (m: Meeting) => string }) {
  // هفتهٔ تقویمی: شنبه تا جمعه. به‌جای جابه‌جا کردن روزها، بعد از رندر
  // به ستون امروز اسکرول می‌کنیم تا هم ترتیب طبیعی بماند هم امروز پیدا باشد.
  const c = jToDate(cur.jy, cur.jm, cur.jd);
  const sat = addDays(c, -((c.getUTCDay() + 1) % 7));
  const days = Array.from({ length: 7 }, (_, i) => dateToJ(addDays(sat, i)));
  const todayCol = days.findIndex((j) => sameJ(j, todayJ()));
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || todayCol < 0) return;
    // فقط وقتی جدول از عرضِ دیدرس بیرون می‌زند (موبایل) معنا دارد
    if (el.scrollWidth <= el.clientWidth + 4) return;
    const colW = (el.scrollWidth - 52) / 7;
    const target = 52 + colW * todayCol - (el.clientWidth - colW) / 2;
    el.scrollTo({ left: -Math.max(0, target), behavior: 'smooth' });   // RTL: اسکرول منفی
  }, [todayCol, days[0].jy, days[0].jm, days[0].jd]);
  return (
    <div className="cal-scroll" ref={gridRef}>
      <div className="cal-time wk">
        <div className="wk-head" style={{ gridTemplateColumns: '52px repeat(7,1fr)' }}>
          <div className="corner" />
          {days.map((j, i) => {
            const today = sameJ(j, todayJ());
            return (
              <button className={'dh' + (today ? ' today' : '')} key={i} onClick={() => onDay(j)}>
                <small>{jWeekdaysShort[faWeekday(j.jy, j.jm, j.jd)]}</small><b className="num">{toFa(j.jd)}</b>
              </button>
            );
          })}
        </div>
        <div className="tgrid" style={{ gridTemplateColumns: '52px repeat(7,1fr)' }}>
          <div className="tc">
            {Array.from({ length: END - START }, (_, i) => <div className="hl num" key={i}>{toFa(START + i)}</div>)}
          </div>
          {days.map((j, di) => {
            const items = meetingsOn(j);
            const today = sameJ(j, todayJ());
            return (
              <div className="dcol" key={di}>
                {Array.from({ length: END - START }, (_, i) => <div className="slot" key={i} />)}
                {today && <div className="now-line" style={{ top: (nowHour() - START) * HOUR }} />}
                {items.map((m) => (
                  <button key={m.id} className={'cev sm' + (items.some((x) => x.id !== m.id && x.start < m.end && x.end > m.start) ? ' clash' : '')}
                    onClick={() => open(m, items)}
                    style={{ top: (m.start - START) * HOUR, height: (m.end - m.start) * HOUR - 3, background: `color-mix(in srgb,${color(m)} 16%,var(--panel))`, borderColor: color(m), color: color(m) }}>
                    <b>{m.title}</b>
                    <small className="num">{fmtTime(m.start)}</small>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ===================== Month ===================== */
function MonthView({ cur, meetingsOn, onDay, color }: { cur: JDate; meetingsOn: (j: JDate) => Meeting[]; onDay: (j: JDate) => void; color: (m: Meeting) => string }) {
  const offset = faWeekday(cur.jy, cur.jm, 1);
  const len = jMonthLength(cur.jy, cur.jm);
  const rows = Math.ceil((offset + len) / 7);
  const gridStart = addDays(jToDate(cur.jy, cur.jm, 1), -offset);
  const cells = Array.from({ length: rows * 7 }, (_, i) => dateToJ(addDays(gridStart, i)));
  return (
    <div className="month">
      <div className="mhead">
        {jWeekdays.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="mgrid" style={{ gridTemplateRows: `repeat(${rows},1fr)` }}>
        {cells.map((j, i) => {
          const inMonth = j.jm === cur.jm && j.jy === cur.jy;
          const items = inMonth ? meetingsOn(j) : [];
          const today = sameJ(j, todayJ());
          return (
            <button className={'mcell' + (inMonth ? '' : ' out') + (today ? ' today' : '')} key={i} onClick={() => onDay(j)}>
              <span className="md num">{toFa(j.jd)}</span>
              <span className="mdots only-mobile">
                {items.slice(0, 4).map((m) => <i key={m.id} style={{ background: color(m) }} />)}
              </span>
              <span className="mchips only-desktop">
                {items.slice(0, 3).map((m) => (
                  <i key={m.id} className="chip" style={{ background: `color-mix(in srgb,${color(m)} 15%,transparent)`, color: color(m) }}>
                    <em style={{ background: color(m) }} />{m.title}
                  </i>
                ))}
                {items.length > 3 && <i className="more num">+{toFa(items.length - 3)}</i>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== Year ===================== */
function YearView({ jy, meetingsOn, onMonth }: { jy: number; meetingsOn: (j: JDate) => Meeting[]; onMonth: (jm: number) => void }) {
  const t = todayJ();
  const currentMonth = t.jy === jy ? t.jm : 0;
  const box = useRef<HTMLDivElement>(null);

  // ماه جاری را وسط دید می‌آورد؛ در سال‌های دیگر کاری نمی‌کند
  useEffect(() => {
    if (!currentMonth) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-month="${currentMonth}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentMonth, jy]);

  return (
    <div className="year" ref={box}>
      {Array.from({ length: 12 }, (_, mi) => {
        const jm = mi + 1;
        const offset = faWeekday(jy, jm, 1);
        const len = jMonthLength(jy, jm);
        const cells = Array.from({ length: offset + len }, (_, i) => (i < offset ? null : i - offset + 1));
        return (
          <button className={'ymini' + (jm === currentMonth ? ' now' : '')} key={jm}
            data-month={jm} onClick={() => onMonth(jm)}>
            <div className="ym-name">{jMonths[mi]}</div>
            <div className="ym-wd">{jWeekdaysShort.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className="ym-days">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const j = { jy, jm, jd: d };
                const has = meetingsOn(j).length > 0;
                const today = sameJ(j, todayJ());
                return <span key={i} className={'yd' + (has ? ' has' : '') + (today ? ' today' : '')}>{toFa(d)}</span>;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ===================== جلسه‌های هم‌پوشان ===================== */
function OverlapDialog({
  items, color, rooms, onPick, onClose,
}: {
  items: Meeting[];
  color: (m: Meeting) => string;
  rooms: Record<string, { name: string }>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { setBox, dismiss } = useSheet(true, onClose);
  return (
    <Portal>
      <div className="modal-overlay show" onClick={dismiss}>
        <div className="modal sm" ref={setBox} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2>{toFa(items.length)} جلسهٔ هم‌زمان</h2>
            <button className="close" onClick={dismiss} aria-label="بستن"><IconX size={17} /></button>
          </div>
          <div className="modal-body">
            <p className="cm-lead">این جلسه‌ها با هم هم‌پوشانی زمانی دارند؛ یکی را برای دیدن انتخاب کنید.</p>
            <ul className="ov-list">
              {items.map((m) => (
                <li key={m.id}>
                  <button onClick={() => onPick(m.id)}>
                    <span className="ov-bar" style={{ background: color(m) }} />
                    <span className="ov-time num">{fmtTime(m.start)}<small>{fmtTime(m.end)}</small></span>
                    <span className="ov-body">
                      <b>{m.title}</b>
                      <small>{m.type === 'online' ? 'جلسهٔ آنلاین' : (rooms[m.room]?.name ?? '—')}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Portal>
  );
}
