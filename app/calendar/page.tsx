'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { dayNames, dayNums, rooms, typeLabels, typeColor, TODAY, fmtTime, toFa } from '@/lib/data';

const START = 8, END = 18, SLOT = 54;

export default function CalendarPage() {
  const store = useStore();
  const router = useRouter();
  const byDay = (d: number) => store.meetings.filter((m) => m.day === d).sort((a, b) => a.start - b.start);

  return (
    <>
      <div className="page-head">
        <h1>تقویم هفتگی</h1>
        <p>هفتهٔ ۲۰ تا ۲۴ تیر ۱۴۰۴ — رنگ هر جلسه نوع آن را نشان می‌دهد.</p>
      </div>

      {/* Mobile / tablet: agenda grouped by day */}
      <div className="agenda-cal">
        {dayNames.map((dn, d) => {
          const list = byDay(d);
          if (list.length === 0) return null;
          return (
            <div key={d} style={{ marginBottom: 18 }}>
              <div className="section-title" style={{ margin: '4px 2px 10px' }}>
                <h2 style={{ fontSize: 15 }}>
                  {dn} <span className="num" style={{ color: 'var(--muted)', fontWeight: 700 }}>{dayNums[d]} تیر</span>
                  {d === TODAY && <span className="pill p-confirmed" style={{ marginInlineStart: 8 }}>امروز</span>}
                </h2>
                <span className="num" style={{ color: 'var(--muted)', fontSize: 12.5 }}>{toFa(list.length)} جلسه</span>
              </div>
              <div className="mlist">{list.map((m) => <MeetingRow key={m.id} m={m} />)}</div>
            </div>
          );
        })}
      </div>

      {/* Desktop: week grid */}
      <div className="weekgrid">
        <div className="corner" />
        {dayNames.map((dn, d) => (
          <div className={'dh' + (d === TODAY ? ' today' : '')} key={d}>
            <small>{dn}</small><b className="num">{dayNums[d]}</b>
          </div>
        ))}
        <div className="tc">
          {Array.from({ length: END - START }, (_, i) => (
            <div className="hl num" key={i}>{toFa(START + i)}:۰۰</div>
          ))}
        </div>
        {dayNames.map((_, d) => (
          <div className="dc" key={d}>
            {Array.from({ length: END - START }, (_, i) => <div className="slot" key={i} />)}
            {byDay(d).map((m) => {
              const top = (m.start - START) * SLOT;
              const h = (m.end - m.start) * SLOT - 4;
              return (
                <div key={m.id} className="wev" style={{ top, height: h, background: `color-mix(in srgb,${typeColor[m.type]} 15%,var(--panel))`, borderColor: typeColor[m.type], color: typeColor[m.type] }}
                  onClick={() => router.push(`/meetings/${m.id}`)}>
                  <b>{m.title}</b>
                  <small className="num">{fmtTime(m.start)} · {rooms[m.room].name}</small>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
