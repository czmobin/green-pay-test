'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { minuteMeta, dayNames, TODAY, toFa, normalizeFa } from '@/lib/data';
import type { Meeting, Minute } from '@/lib/types';
import {
  IconReminder, IconSearch, IconX, IconCheck, IconClock, IconUsers, IconList, IconChevron,
} from '@/components/Icons';
import { minuteIcon } from '@/components/Icons';

type Item = { mn: Minute; m: Meeting };
type TypeF = 'all' | 'task' | 'reminder';
type TimeF = 'all' | 'today' | 'upcoming' | 'past';

export default function RemindersPage() {
  const store = useStore();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [tf, setTf] = useState<TypeF>('all');
  const [time, setTime] = useState<TimeF>('all');

  const items: Item[] = [];
  store.visibleMeetings.forEach((m) => (store.minutes[m.id] ?? []).forEach((mn) => {
    if (mn.type === 'task' || mn.type === 'reminder') items.push({ mn, m });
  }));

  const openTasks = items.filter((x) => x.mn.type === 'task' && !x.mn.done).length;
  const reminders = items.filter((x) => x.mn.type === 'reminder').length;
  const overdue = items.filter((x) => x.mn.type === 'task' && !x.mn.done && x.m.day < TODAY).length;

  const nq = normalizeFa(q);
  const rows = items
    .filter(({ mn, m }) => {
      if (tf !== 'all' && mn.type !== tf) return false;
      if (time === 'today' && m.day !== TODAY) return false;
      if (time === 'upcoming' && m.day < TODAY) return false;
      if (time === 'past' && m.day >= TODAY) return false;
      if (nq && !normalizeFa(mn.text + ' ' + m.title).includes(nq)) return false;
      return true;
    })
    .sort((a, b) => a.m.day - b.m.day || a.m.start - b.m.start);

  const scope = useReveal(['.page-head', '.rem-stat', '.searchbar', '.filters', '.rem']);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>یادآورها و تسک‌ها</h1>
        <p>همهٔ تسک‌ها و یادآورهایی که داخل صورت‌جلسه‌ها ثبت شده — با فیلتر زمان و جستجو.</p>
      </div>

      <div className="rem-count">
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: minuteMeta.task.color }} />{toFa(openTasks)}</div><div className="rs-lbl">تسک باز</div></div>
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: minuteMeta.reminder.color }} />{toFa(reminders)}</div><div className="rs-lbl">یادآور</div></div>
        <div className="rem-stat"><div className="rs-val num"><i style={{ background: 'var(--danger)' }} />{toFa(overdue)}</div><div className="rs-lbl">عقب‌افتاده</div></div>
      </div>

      <div className="searchbar">
        <IconSearch size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان…" />
        {q && <button className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
      </div>

      <div className="filters">
        <button className={'chip-btn' + (tf === 'all' ? ' active' : '')} onClick={() => setTf('all')}>همه</button>
        <button className={'chip-btn' + (tf === 'task' ? ' active' : '')} onClick={() => setTf('task')}>
          <span className="cdot" style={{ background: minuteMeta.task.color }} />تسک‌ها</button>
        <button className={'chip-btn' + (tf === 'reminder' ? ' active' : '')} onClick={() => setTf('reminder')}>
          <span className="cdot" style={{ background: minuteMeta.reminder.color }} />یادآورها</button>
      </div>
      <div className="filters">
        {([['all', 'همه‌ی زمان‌ها'], ['today', 'امروز'], ['upcoming', 'پیش‌رو'], ['past', 'گذشته']] as [TimeF, string][]).map(([id, lbl]) => (
          <button key={id} className={'chip-btn' + (time === id ? ' active' : '')} onClick={() => setTime(id)}>{lbl}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="result-empty"><div><IconReminder size={40} /></div>موردی پیدا نشد. داخل صورت‌جلسه‌ها می‌توانید تسک و یادآور ثبت کنید.</div>
      ) : (
        <div className="rem-list">
          {rows.map(({ mn, m }) => {
            const meta = minuteMeta[mn.type];
            return (
              <div className={'rem' + (mn.done ? ' done' : '')} key={mn.id} onClick={() => router.push(`/meetings/${m.id}`)} style={{ cursor: 'pointer' }}>
                {mn.type === 'task' ? (
                  <button className={'rcheck' + (mn.done ? ' on' : '')} onClick={(e) => { e.stopPropagation(); store.toggleTask(m.id, mn.id); }} aria-label="انجام شد">
                    {mn.done && <IconCheck size={13} />}
                  </button>
                ) : (
                  <span className="ri" style={{ background: `color-mix(in srgb,${meta.color} 15%,transparent)`, color: meta.color }}>{minuteIcon(mn.type, { size: 17 })}</span>
                )}
                <div className="rbody">
                  <div className="rtop"><span className="rtype" style={{ color: meta.color }}>{meta.label}</span></div>
                  <div className="rtitle">{mn.text}</div>
                  <div className="rmeta">
                    <span className="mlink"><IconList size={12} />{m.title.replace(/—.*/, '').trim()}</span>
                    {mn.type === 'task' && mn.assignee && <span><IconUsers size={12} />{store.people[mn.assignee]?.name ?? mn.assignee}</span>}
                    {mn.type === 'task' && mn.due && <span><IconClock size={12} />مهلت: {mn.due}</span>}
                    {mn.type === 'reminder' && mn.when && <span><IconClock size={12} />{mn.when}</span>}
                    <span className="num">{dayNames[m.day]}</span>
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
