'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReveal } from './useReveal';
import { useStore } from './store';
import { typeColor, fmtTime, toFa, meetingJd, CAL_YEAR, CAL_MONTH, TODAY_J, NOW_HOUR } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import {
  jMonths, jWeekdays, jWeekdaysShort, jMonthLength, faWeekday, jToDate, dateToJ, addDays, sameJ, type JDate,
} from '@/lib/jalali';
import { IconChevron, IconBack } from './Icons';

type View = 'day' | 'week' | 'month' | 'year';
const START = 8, END = 19, HOUR = 48;

export default function Calendar() {
  const store = useStore();
  const router = useRouter();
  const [view, setView] = useState<View>('month');
  const [cur, setCur] = useState<JDate>(TODAY_J);

  const meetingsOn = (j: JDate): Meeting[] =>
    (j.jy === CAL_YEAR && j.jm === CAL_MONTH)
      ? store.visibleMeetings.filter((m) => meetingJd(m.day) === j.jd).sort((a, b) => a.start - b.start)
      : [];

  const open = (id: string) => router.push(`/meetings/${id}`);

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
          <button className="today-btn" onClick={() => setCur(TODAY_J)}>امروز</button>
          <button className="arw" onClick={() => nav(1)} aria-label="بعدی"><IconChevron size={18} /></button>
        </div>
        <h3 className="cal-title">{title}</h3>
      </div>

      <div className="cal-view">
        {view === 'day' && <DayView j={cur} meetingsOn={meetingsOn} open={open} />}
        {view === 'week' && <WeekView cur={cur} meetingsOn={meetingsOn} open={open} onDay={(j) => { setCur(j); setView('day'); }} />}
        {view === 'month' && <MonthView cur={cur} meetingsOn={meetingsOn} onDay={(j) => { setCur(j); setView('day'); }} />}
        {view === 'year' && <YearView jy={cur.jy} meetingsOn={meetingsOn} onMonth={(jm) => { setCur({ jy: cur.jy, jm, jd: 1 }); setView('month'); }} />}
      </div>
    </div>
  );
}

/* ===================== Day ===================== */
function DayView({ j, meetingsOn, open }: { j: JDate; meetingsOn: (j: JDate) => Meeting[]; open: (id: string) => void }) {
  const { rooms } = useStore();
  const items = meetingsOn(j);
  const isToday = sameJ(j, TODAY_J);
  return (
    <div className="cal-time">
      <div className="tgrid" style={{ gridTemplateColumns: '52px 1fr' }}>
        <div className="tc">
          {Array.from({ length: END - START }, (_, i) => <div className="hl num" key={i}>{toFa(START + i)}:۰۰</div>)}
        </div>
        <div className="dcol">
          {Array.from({ length: END - START }, (_, i) => <div className="slot" key={i} />)}
          {isToday && <div className="now-line" style={{ top: (NOW_HOUR - START) * HOUR }} />}
          {items.map((m) => (
            <button key={m.id} className="cev" onClick={() => open(m.id)}
              style={{ top: (m.start - START) * HOUR, height: (m.end - m.start) * HOUR - 3, background: `color-mix(in srgb,${typeColor[m.type]} 15%,var(--panel))`, borderColor: typeColor[m.type], color: typeColor[m.type] }}>
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
function WeekView({ cur, meetingsOn, open, onDay }: { cur: JDate; meetingsOn: (j: JDate) => Meeting[]; open: (id: string) => void; onDay: (j: JDate) => void }) {
  const c = jToDate(cur.jy, cur.jm, cur.jd);
  const sat = addDays(c, -((c.getUTCDay() + 1) % 7));
  const days = Array.from({ length: 7 }, (_, i) => dateToJ(addDays(sat, i)));
  return (
    <div className="cal-scroll">
      <div className="cal-time wk">
        <div className="wk-head" style={{ gridTemplateColumns: '52px repeat(7,1fr)' }}>
          <div className="corner" />
          {days.map((j, i) => {
            const today = sameJ(j, TODAY_J);
            return (
              <button className={'dh' + (today ? ' today' : '')} key={i} onClick={() => onDay(j)}>
                <small>{jWeekdaysShort[i]}</small><b className="num">{toFa(j.jd)}</b>
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
            const today = sameJ(j, TODAY_J);
            return (
              <div className="dcol" key={di}>
                {Array.from({ length: END - START }, (_, i) => <div className="slot" key={i} />)}
                {today && <div className="now-line" style={{ top: (NOW_HOUR - START) * HOUR }} />}
                {items.map((m) => (
                  <button key={m.id} className="cev sm" onClick={() => open(m.id)}
                    style={{ top: (m.start - START) * HOUR, height: (m.end - m.start) * HOUR - 3, background: `color-mix(in srgb,${typeColor[m.type]} 16%,var(--panel))`, borderColor: typeColor[m.type], color: typeColor[m.type] }}>
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
function MonthView({ cur, meetingsOn, onDay }: { cur: JDate; meetingsOn: (j: JDate) => Meeting[]; onDay: (j: JDate) => void }) {
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
          const today = sameJ(j, TODAY_J);
          return (
            <button className={'mcell' + (inMonth ? '' : ' out') + (today ? ' today' : '')} key={i} onClick={() => onDay(j)}>
              <span className="md num">{toFa(j.jd)}</span>
              <span className="mdots only-mobile">
                {items.slice(0, 4).map((m) => <i key={m.id} style={{ background: typeColor[m.type] }} />)}
              </span>
              <span className="mchips only-desktop">
                {items.slice(0, 3).map((m) => (
                  <i key={m.id} className="chip" style={{ background: `color-mix(in srgb,${typeColor[m.type]} 15%,transparent)`, color: typeColor[m.type] }}>
                    <em style={{ background: typeColor[m.type] }} />{m.title}
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
  return (
    <div className="year">
      {Array.from({ length: 12 }, (_, mi) => {
        const jm = mi + 1;
        const offset = faWeekday(jy, jm, 1);
        const len = jMonthLength(jy, jm);
        const cells = Array.from({ length: offset + len }, (_, i) => (i < offset ? null : i - offset + 1));
        return (
          <button className="ymini" key={jm} onClick={() => onMonth(jm)}>
            <div className="ym-name">{jMonths[mi]}</div>
            <div className="ym-wd">{jWeekdaysShort.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className="ym-days">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const j = { jy, jm, jd: d };
                const has = meetingsOn(j).length > 0;
                const today = sameJ(j, TODAY_J);
                return <span key={i} className={'yd' + (has ? ' has' : '') + (today ? ' today' : '')}>{toFa(d)}</span>;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
