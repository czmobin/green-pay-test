'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@/lib/types';
import { meetingColor, statusLabels, fmtTime, initials, toFa, faDateLabel, priorityLabels, priorityColor } from '@/lib/data';
import { useStore } from './store';
import { IconMapPin, IconChevron } from './Icons';

export default function MeetingRow({ m, showDate = false }: { m: Meeting; showDate?: boolean }) {
  const router = useRouter();
  const { people, rooms, categories } = useStore();
  const color = meetingColor(categories, m);
  const cat = categories[m.category];
  const shown = m.parts.slice(0, 3);
  const extra = m.parts.length + m.guests.length - shown.length;
  return (
    <button className="mrow" onClick={() => router.push(`/meetings/${m.id}`)}>
      <span className="bar" style={{ background: color }} />
      <span className="time">
        <b className="num">{fmtTime(m.start)}</b>
        <small className="num">{fmtTime(m.end)}</small>
      </span>
      <span className="body">
        <span className="t">{m.title}</span>
        {/* سطر محل: تنها چیزی که کنارش می‌آید تاریخ است */}
        <span className="meta">
          {showDate && <span className="num">{faDateLabel(m.date)}</span>}
          <span><IconMapPin size={12} />{m.type === 'online' ? 'جلسهٔ آنلاین' : (rooms[m.room]?.name ?? '—')}</span>
        </span>
        {/* تگ‌ها همیشه در سطر جدا، تا سطر محل شلوغ نشود */}
        <span className="chips">
          {cat && (
            <span className="cat-chip" style={{ color, background: `color-mix(in srgb,${color} 14%,transparent)` }}>
              <i style={{ background: color }} />{cat.name}
            </span>
          )}
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
