'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import { minuteMeta, toFa, initials, faDate, todayISO, remindLabel } from '@/lib/data';
import DatePicker from './DatePicker';
import TimePicker from './TimePicker';
import type { AgendaItem, Meeting, Minute, MinuteType } from '@/lib/types';
import { minuteIcon, IconDoc, IconPlus, IconTrash, IconCheck, IconClock, IconCall, IconUsers, IconPaperclip, IconEdit, IconList } from './Icons';

const order: MinuteType[] = ['note', 'decision', 'task', 'reminder', 'call', 'letter', 'file'];
/** انواعی که وضعیت انجام دارند */
const DONEABLE = new Set<MinuteType>(['task', 'reminder', 'call']);

export default function MinutesEditor({ meeting }: { meeting: Meeting }) {
  const store = useStore();
  const list = store.minutes[meeting.id] ?? [];
  const [activeP, setActiveP] = useState<string>('general');
  const [type, setType] = useState<MinuteType>('note');
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState(meeting.parts[0] ?? 'ceo');
  const [due, setDue] = useState('');   // تاریخ ISO مهلت
  const [remindDate, setRemindDate] = useState('');   // تاریخ ISO یادآوری
  const [remindHour, setRemindHour] = useState(9);    // ساعت اعشاری یادآوری
  const [who, setWho] = useState('');
  const [phone, setPhone] = useState('');
  const [fileName, setFileName] = useState('');
  const [agendaItem, setAgendaItem] = useState('');   // اختیاری — این آیتم ذیل کدام بند مطرح شد

  const [saving, setSaving] = useState(false);
  const isFile = type === 'letter' || type === 'file';
  const bucketList = list.filter((m) => (activeP === 'general' ? !m.participant : m.participant === activeP));
  const bucketOf = (pid: string) => list.filter((m) => (pid === 'general' ? !m.participant : m.participant === pid)).length;

  async function add() {
    if (!text.trim() && !(isFile && fileName)) {
      store.toast(isFile ? 'فایل را انتخاب یا توضیح بنویسید' : 'متن صورت‌جلسه را بنویسید', 'info');
      return;
    }
    setSaving(true);
    await store.addMinute({
      meeting: meeting.id,
      participant: activeP === 'general' ? null : activeP,
      type,
      text: text.trim() || fileName,
      assignee: type === 'task' ? assignee : null,
      due: type === 'task' ? (due || todayISO()) : null,
      remindDate: type === 'reminder' ? (remindDate || todayISO()) : null,
      remindHour: type === 'reminder' ? remindHour : null,
      who: type === 'call' ? who : '',
      phone: type === 'call' ? phone : '',
      fileName: isFile ? fileName : '',
      agendaItem: agendaItem || null,
    });
    setSaving(false);
    setText(''); setDue(''); setRemindDate(''); setRemindHour(9);
    setWho(''); setPhone(''); setFileName(''); setAgendaItem('');
    store.toast(`${minuteMeta[type].label} ثبت شد`, 'ok');
  }

  const counts = order.map((t) => ({ t, n: list.filter((x) => x.type === t).length })).filter((c) => c.n > 0);

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

      {/* per-participant bucket selector */}
      <div className="p-buckets">
        <button className={'pb' + (activeP === 'general' ? ' active' : '')} onClick={() => setActiveP('general')}>
          عمومی{bucketOf('general') > 0 && <span className="pb-n num">{toFa(bucketOf('general'))}</span>}
        </button>
        {meeting.parts.map((pid) => {
          const p = store.people[pid]; if (!p) return null;
          const n = bucketOf(pid);
          return (
            <button key={pid} className={'pb' + (activeP === pid ? ' active' : '')} onClick={() => setActiveP(pid)}>
              <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>
              {p.name.split(' ')[0]}{n > 0 && <span className="pb-n num">{toFa(n)}</span>}
            </button>
          );
        })}
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
            <DatePicker value={due || todayISO()} onChange={setDue} min={todayISO()} />
          </div>
        )}
        {type === 'reminder' && (
          <div className="extra">
            <div className="field"><label>تاریخ یادآوری</label>
              <DatePicker value={remindDate || todayISO()} onChange={setRemindDate} min={todayISO()} />
            </div>
            <div className="field"><label>ساعت یادآوری</label>
              <TimePicker value={remindHour} onChange={setRemindHour} />
            </div>
          </div>
        )}
        {type === 'call' && (
          <div className="extra">
            <input className="field-in" type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="با چه کسی" />
            <input className="field-in num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="شمارهٔ تماس" />
          </div>
        )}
        {isFile && (
          <div className="extra">
            <label className="file-btn full">
              <IconPaperclip size={15} />
              <span className="fn">{fileName || (type === 'letter' ? 'انتخاب نامه (پیوست)' : 'انتخاب فایل')}</span>
              <input type="file" hidden onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
            </label>
          </div>
        )}

        {meeting.agenda.length > 0 && (
          <div className="extra">
            <select className="field-in full" value={agendaItem} onChange={(e) => setAgendaItem(e.target.value)}
              aria-label="اتصال به دستور جلسه">
              <option value="">— اتصال به دستور جلسه (اختیاری) —</option>
              {meeting.agenda.map((a, i) => <option key={a.id} value={a.id}>{toFa(i + 1)}. {a.title}</option>)}
            </select>
          </div>
        )}

        <div className="cta">
          <button className="btn btn-primary" onClick={add} type="button" disabled={saving}>
            <IconPlus size={16} />{saving ? 'در حال ذخیره…' : 'افزودن به صورت‌جلسه'}
          </button>
        </div>
      </div>

      {/* list (of active bucket) */}
      {bucketList.length === 0 ? (
        <div className="empty">
          <div><IconDoc size={34} /></div>
          {activeP === 'general'
            ? 'صورت‌جلسهٔ عمومی خالی است — یادداشت، تصمیم، تسک، یادآور، تماس، نامه یا فایل اضافه کنید.'
            : `برای «${store.people[activeP]?.name}» هنوز موردی ثبت نشده.`}
        </div>
      ) : (
        <div className="minute-list">
          {bucketList.map((m) => <MinuteRow key={m.id} m={m} mid={meeting.id} agenda={meeting.agenda} />)}
        </div>
      )}
    </section>
  );
}

function MinuteRow({ m, mid, agenda }: { m: Minute; mid: string; agenda: AgendaItem[] }) {
  const store = useStore();
  const meta = minuteMeta[m.type];
  const hasFile = m.type === 'letter' || m.type === 'file';

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [assignee, setAssignee] = useState(m.assignee ?? '');
  const [due, setDue] = useState(m.due ?? '');
  const [rDate, setRDate] = useState(m.remindDate ?? '');
  const [rHour, setRHour] = useState(m.remindHour ?? 9);
  const [who, setWho] = useState(m.who ?? '');
  const [phone, setPhone] = useState(m.phone ?? '');
  const [item, setItem] = useState(m.agendaItem ?? '');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setText(m.text); setAssignee(m.assignee ?? ''); setDue(m.due ?? '');
    setRDate(m.remindDate ?? ''); setRHour(m.remindHour ?? 9);
    setWho(m.who ?? ''); setPhone(m.phone ?? ''); setItem(m.agendaItem ?? '');
    setEditing(true);
  }

  async function save() {
    if (!text.trim() && !hasFile) { store.toast('متن نمی‌تواند خالی باشد', 'info'); return; }
    setBusy(true);
    await store.updateMinute(mid, m.id, {
      text: text.trim(),
      agendaItem: item || null,
      ...(m.type === 'task' ? { assignee: assignee || null, due: due || null } : {}),
      ...(m.type === 'reminder' ? { remindDate: rDate || null, remindHour: rHour } : {}),
      ...(m.type === 'call' ? { who, phone } : {}),
    });
    setBusy(false); setEditing(false);
    store.toast('صورت‌جلسه ویرایش شد', 'ok');
  }

  const linked = agenda.find((a) => a.id === m.agendaItem);

  if (editing) {
    return (
      <div className="minute editing">
        <span className="mi" style={{ background: `color-mix(in srgb,${meta.color} 15%,transparent)`, color: meta.color }}>
          {minuteIcon(m.type, { size: 16 })}
        </span>
        <div className="mc">
          <textarea className="field-in" rows={2} value={text} autoFocus
            onChange={(e) => setText(e.target.value)} placeholder={meta.label} />

          {m.type === 'task' && (
            <div className="extra">
              <select className="field-in" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">— بدون مسئول —</option>
                {Object.values(store.people).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <DatePicker value={due || todayISO()} onChange={setDue} />
            </div>
          )}
          {m.type === 'reminder' && (
            <div className="extra">
              <DatePicker value={rDate || todayISO()} onChange={setRDate} />
              <TimePicker value={rHour} onChange={setRHour} />
            </div>
          )}
          {m.type === 'call' && (
            <div className="extra">
              <input className="field-in" value={who} onChange={(e) => setWho(e.target.value)} placeholder="با چه کسی" />
              <input className="field-in num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="شمارهٔ تماس" />
            </div>
          )}

          {agenda.length > 0 && (
            <div className="extra">
              <select className="field-in full" value={item} onChange={(e) => setItem(e.target.value)}>
                <option value="">— بدون اتصال به دستور جلسه —</option>
                {agenda.map((a, i) => <option key={a.id} value={a.id}>{toFa(i + 1)}. {a.title}</option>)}
              </select>
            </div>
          )}

          <div className="me-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              <IconCheck size={15} />{busy ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>انصراف</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={'minute' + (m.done ? ' done' : '')}>
      {DONEABLE.has(m.type) ? (
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
        {!(hasFile && m.text === m.fileName) && <div className="mtext">{m.text}</div>}
        <div className="mextra">
          {hasFile && m.fileName && (
            <button className="file-chip" onClick={() => store.toast('دانلود پیوست (دمو)', 'ok')}>
              <IconPaperclip size={12} />{m.fileName}
            </button>
          )}
          {m.done && <span className="done-tag">انجام شد</span>}
          {m.type === 'task' && m.assignee && <span><IconUsers size={12} />{store.people[m.assignee]?.name ?? m.assignee}</span>}
          {m.type === 'task' && m.due && <span><IconClock size={12} />مهلت: {faDate(m.due)}</span>}
          {m.type === 'reminder' && remindLabel(m) && <span><IconClock size={12} />{remindLabel(m)}</span>}
          {m.type === 'call' && m.who && <span><IconCall size={12} />{m.who}</span>}
          {m.type === 'call' && m.phone && <span className="num">{m.phone}</span>}
          {linked && <span className="ag-link"><IconList size={12} />{linked.title}</span>}
          {m.editedAt && <span className="edited">ویرایش‌شده</span>}
        </div>
      </div>
      <span className="mtools">
        <button className="mdel" onClick={startEdit} aria-label="ویرایش"><IconEdit size={15} /></button>
        <button className="mdel" onClick={() => store.deleteMinute(mid, m.id)} aria-label="حذف"><IconTrash size={16} /></button>
      </span>
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
    case 'letter': return 'توضیح نامه (اختیاری)…';
    case 'file': return 'توضیح فایل (اختیاری)…';
    default: return '';
  }
}
function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return toFa(`${hh}:${mm}`);
}
