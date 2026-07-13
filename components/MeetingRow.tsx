'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@/lib/types';
import { rooms, people, guests, typeLabels, typeColor, statusLabels, fmtTime, initials, toFa, dayNames } from '@/lib/data';
import { IconMapPin, IconGuests, IconChevron } from './Icons';

export default function MeetingRow({ m, showDay = false }: { m: Meeting; showDay?: boolean }) {
  const router = useRouter();
  const shown = m.parts.slice(0, 3);
  const extra = m.parts.length + m.guests.length - shown.length;
  return (
    <button className="mrow" onClick={() => router.push(`/meetings/${m.id}`)}>
      <span className="bar" style={{ background: typeColor[m.type] }} />
      <span className="time">
        <b className="num">{fmtTime(m.start)}</b>
        <small className="num">{fmtTime(m.end)}</small>
      </span>
      <span className="body">
        <span className="t">{m.title}</span>
        <span className="meta">
          {showDay && <span className="num">{dayNames[m.day]}</span>}
          <span><IconMapPin size={12} />{rooms[m.room].name}</span>
          {m.guests.length > 0 && <span style={{ color: 'var(--info)' }}><IconGuests size={12} />{toFa(m.guests.length)} مهمان</span>}
          <span className={'tag t-' + m.type}>{typeLabels[m.type]}</span>
        </span>
      </span>
      <span className="side">
        <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
        <span className="avstack">
          {shown.map((pid) => {
            const p = people[pid];
            return <span className="ava sm" key={pid} style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>;
          })}
          {extra > 0 && <span className="more num">+{toFa(extra)}</span>}
        </span>
      </span>
      <span className="chev"><IconChevron size={18} /></span>
    </button>
  );
}
