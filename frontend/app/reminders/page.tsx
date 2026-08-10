'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import DueBadge from '@/components/DueBadge';
import { minuteMeta, toFa, normalizeFa, todayISO, faDateLabel, faDate, remindLabel } from '@/lib/data';
import type { Meeting, Minute } from '@/lib/types';
import {
  IconReminder, IconSearch, IconX, IconCheck, IconClock, IconUsers, IconList, IconChevron,
} from '@/components/Icons';
import { minuteIcon } from '@/components/Icons';

type Item = { mn: Minute; m: Meeting };
type TimeF = 'all' | 'today' | 'upcoming' | 'past';

export default function RemindersPage() {
  const store = useStore();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [time, setTime] = useState<TimeF>('all');

  const items: Item[] = [];
  store.visibleMeetings.forEach((m) => (store.minutes[m.id] ?? []).forEach((mn) => {
    if (mn.type === 'reminder') items.push({ mn, m });
  }));

  const openCount = items.filter((x) => !x.mn.done).length;
  const doneCount = items.filter((x) => x.mn.done).length;
  const iso = todayISO();
  /** عقب‌افتاده یعنی مهلتِ خودِ آیتم گذشته باشد، نه اینکه جلسه‌اش قدیمی باشد. */
  const isOverdue = ({ mn }: Item) => !mn.done && !!mn.remindDate && mn.remindDate < iso;
  const overdue = items.filter(isOverdue).length;

  const nq = normalizeFa(q);
  const rows = items
    .filter(({ mn, m }) => {
      if (time === 'today' && m.date !== iso) return false;
      if (time === 'upcoming' && m.date < iso) return false;
      if (time === 'past' && m.date >= iso) return false;
      if (nq && !normalizeFa(mn.text + ' ' + m.title).includes(nq)) return false;
      return true;
    })
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.m.start - b.m.start);

  const scope = useReveal(['.page-head', '.rem-stat', '.searchbar', '.filters', '.rem']);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>یادآورها</h1>
        <p>همهٔ یادآورهایی که داخل صورت‌جلسه‌ها ثبت شده — با فیلتر زمان و جستجو.</p>
      </div>

      <div className="rem-count">
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: minuteMeta.reminder.color }} />{toFa(openCount)}</div><div className="rs-lbl">انجام‌نشده</div></div>
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: 'var(--ok)' }} />{toFa(doneCount)}</div><div className="rs-lbl">انجام‌شده</div></div>
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: 'var(--danger)' }} />{toFa(overdue)}</div><div className="rs-lbl">عقب‌افتاده</div></div>
      </div>

      <div className="searchbar">
        <IconSearch size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان…" />
        {q && <button className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
      </div>

      <div className="filters">
        {([['all', 'همه‌ی زمان‌ها'], ['today', 'امروز'], ['upcoming', 'پیش‌رو'], ['past', 'گذشته']] as [TimeF, string][]).map(([id, lbl]) => (
          <button key={id} className={'chip-btn' + (time === id ? ' active' : '')} onClick={() => setTime(id)}>{lbl}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="result-empty"><div><IconReminder size={40} /></div>موردی پیدا نشد. داخل صورت‌جلسه‌ها می‌توانید یادآور ثبت کنید.</div>
      ) : (
        <div className="rem-list">
          {rows.map(({ mn, m }) => {
            const meta = minuteMeta[mn.type];
            return (
              <div className={'rem' + (mn.done ? ' done' : '') + (isOverdue({ mn, m }) ? ' late' : '')} key={mn.id} onClick={() => router.push(`/meetings/${m.id}`)} style={{ cursor: 'pointer' }}>
                <button className={'rcheck' + (mn.done ? ' on' : '')}
                  onClick={(e) => { e.stopPropagation(); store.toggleDone(m.id, mn.id); }}
                  aria-label={mn.done ? 'برگرداندن به انجام‌نشده' : 'انجام شد'}>
                  {mn.done && <IconCheck size={13} />}
                </button>
                <div className="rbody">
                  <div className="rtop"><span className="rtype" style={{ color: meta.color }}>{meta.label}</span></div>
                  <div className="rtitle">{mn.text}</div>
                  <div className="rmeta">
                    <span className="mlink"><IconList size={12} />{m.title.replace(/—.*/, '').trim()}</span>
                    {/* تاریخ جلسه برداشته شد؛ چیزی که اهمیت دارد زمانِ خودِ
                        یادآور و فاصله تا آن است */}
                    {remindLabel(mn) && <span><IconClock size={12} />{remindLabel(mn)}</span>}
                    {mn.remindDate && !mn.done && <DueBadge iso={mn.remindDate} />}
                  </div>
                </div>
                <span className="chev"><IconChevron size={18} /></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
