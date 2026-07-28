'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@/lib/types';
import { typeLabels, typeColor, statusLabels, fmtTime, initials, toFa, faDateLabel, priorityLabels, priorityColor } from '@/lib/data';
import { useStore } from './store';
import { IconMapPin, IconChevron } from './Icons';

export default function MeetingRow({ m, showDate = false }: { m: Meeting; showDate?: boolean }) {
  const router = useRouter();
  const { people, rooms } = useStore();
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
          {showDate && <span className="num">{faDateLabel(m.date)}</span>}
          <span><IconMapPin size={12} />{rooms[m.room]?.name ?? '—'}</span>
          <span className={'tag t-' + m.type}>{typeLabels[m.type]}</span>
          <span className="prio-chip" style={{ color: priorityColor[m.priority ?? 'normal'], background: `color-mix(in srgb,${priorityColor[m.priority ?? 'normal']} 14%,transparent)` }}>
            اولویت {priorityLabels[m.priority ?? 'normal']}
          </span>
        </span>
      </span>
      <span className="side">
        <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
        <span className="avstack">
          {shown.map((pid) => {
            const p = people[pid];
            if (!p) return null;
            return <span className="ava sm" key={pid} style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>;
          })}
          {extra > 0 && <span className="more num">+{toFa(extra)}</span>}
        </span>
      </span>
      <span className="chev"><IconChevron size={18} /></span>
    </button>
  );
}
