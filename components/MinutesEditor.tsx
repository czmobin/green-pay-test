'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import { minuteMeta, toFa } from '@/lib/data';
import type { Meeting, Minute, MinuteType } from '@/lib/types';
import { minuteIcon, IconDoc, IconPlus, IconTrash, IconCheck, IconClock, IconCall, IconUsers } from './Icons';

const order: MinuteType[] = ['note', 'decision', 'task', 'reminder', 'call'];

export default function MinutesEditor({ meeting }: { meeting: Meeting }) {
  const store = useStore();
  const list = store.minutes[meeting.id] ?? [];
  const [type, setType] = useState<MinuteType>('note');
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState(meeting.parts[0] ?? 'ceo');
  const [due, setDue] = useState('');
  const [when, setWhen] = useState('');
  const [who, setWho] = useState('');
  const [phone, setPhone] = useState('');

  function add() {
    if (!text.trim()) { store.toast('متن صورت‌جلسه را بنویسید', 'info'); return; }
    const m: Minute = { id: 'n' + Date.now().toString(36), type, text: text.trim(), createdAt: Date.now() };
    if (type === 'task') { m.assignee = assignee; if (due) m.due = due; m.done = false; }
    if (type === 'reminder' && when) m.when = when;
    if (type === 'call') { if (who) m.who = who; if (phone) m.phone = phone; }
    store.addMinute(meeting.id, m);
    setText(''); setDue(''); setWhen(''); setWho(''); setPhone('');
    store.toast(`${minuteMeta[type].label} ثبت شد`, 'ok');
  }

  const counts = order
    .map((t) => ({ t, n: list.filter((x) => x.type === t).length }))
    .filter((c) => c.n > 0);

  return (
    <section className="minutes">
      <div className="minutes-head">
        <div className="mh-top">
          <h3><span className="hi"><IconDoc size={18} /></span>صورت‌جلسه</h3>
        </div>
        {counts.length > 0 && (
          <div className="counts">
            {counts.map((c) => (
              <span className="count-chip" key={c.t}><i style={{ background: minuteMeta[c.t].color }} />{toFa(c.n)} {minuteMeta[c.t].label}</span>
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="composer">
        <div className="type-picker">
          {order.map((t) => (
            <button key={t} className={'type-btn' + (type === t ? ' active' : '')}
              style={type === t ? { background: minuteMeta[t].color } : undefined}
              onClick={() => setType(t)} type="button">
              {minuteIcon(t, { size: 15 })}{minuteMeta[t].label}
            </button>
          ))}
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)}
          placeholder={placeholderFor(type)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />

        {type === 'task' && (
          <div className="extra">
            <select className="field-in" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {meeting.parts.map((pid) => <option key={pid} value={pid}>{store.people[pid]?.name ?? pid}</option>)}
            </select>
            <input className="field-in" type="text" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} placeholder="مهلت (مثلاً ۲۵ تیر)" />
          </div>
        )}
        {type === 'reminder' && (
          <div className="extra">
            <input className="field-in full" type="text" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="زمان یادآوری (مثلاً فردا ۱۰:۰۰)" />
          </div>
        )}
        {type === 'call' && (
          <div className="extra">
            <input className="field-in" type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="با چه کسی" />
            <input className="field-in num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="شمارهٔ تماس" />
          </div>
        )}

        <div className="cta">
          <button className="btn btn-primary" onClick={add} type="button"><IconPlus size={16} />افزودن به صورت‌جلسه</button>
        </div>
      </div>

      {/* list */}
      {list.length === 0 ? (
        <div className="empty"><div><IconDoc size={34} /></div>هنوز چیزی ثبت نشده — همین‌جا حین جلسه یادداشت، تصمیم، تسک، یادآور یا تماس اضافه کنید.</div>
      ) : (
        <div className="minute-list">
          {list.map((m) => (
            <MinuteRow key={m.id} m={m} mid={meeting.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function MinuteRow({ m, mid }: { m: Minute; mid: string }) {
  const store = useStore();
  const meta = minuteMeta[m.type];
  return (
    <div className={'minute' + (m.done ? ' done' : '')}>
      {m.type === 'task' ? (
        <button className={'task-check' + (m.done ? ' on' : '')} onClick={() => store.toggleTask(mid, m.id)} aria-label="انجام شد">
          {m.done && <IconCheck size={13} />}
        </button>
      ) : (
        <span className="mi" style={{ background: `color-mix(in srgb,${meta.color} 15%,transparent)`, color: meta.color }}>
          {minuteIcon(m.type, { size: 16 })}
        </span>
      )}
      <div className="mc">
        <div className="mc-top">
          <span className="mtype" style={{ color: meta.color }}>{meta.label}</span>
          <span className="mtime num">{formatClock(m.createdAt)}</span>
        </div>
        <div className="mtext">{m.text}</div>
        <div className="mextra">
          {m.type === 'task' && m.assignee && <span><IconUsers size={12} />{store.people[m.assignee]?.name ?? m.assignee}</span>}
          {m.type === 'task' && m.due && <span><IconClock size={12} />مهلت: {m.due}</span>}
          {m.type === 'reminder' && m.when && <span><IconClock size={12} />{m.when}</span>}
          {m.type === 'call' && m.who && <span><IconCall size={12} />{m.who}</span>}
          {m.type === 'call' && m.phone && <span className="num">{m.phone}</span>}
        </div>
      </div>
      <button className="mdel" onClick={() => store.deleteMinute(mid, m.id)} aria-label="حذف"><IconTrash size={16} /></button>
    </div>
  );
}

function placeholderFor(t: MinuteType): string {
  switch (t) {
    case 'note': return 'یادداشت آزاد از جلسه…';
    case 'decision': return 'تصمیم گرفته‌شده در جلسه را بنویسید…';
    case 'task': return 'کاری که باید انجام شود…';
    case 'reminder': return 'چه چیزی را باید یادآوری کرد؟';
    case 'call': return 'موضوع تماس تلفنی…';
  }
}
function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return toFa(`${hh}:${mm}`);
}
