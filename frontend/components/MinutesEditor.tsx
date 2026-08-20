'use client';
import React, { useState } from 'react';
import { useStore } from './store';
import { minuteMeta, toFa, initials, todayISO, remindLabel } from '@/lib/data';
import DatePicker from './DatePicker';
import DueBadge from './DueBadge';
import TimePicker from './TimePicker';
import type { AgendaItem, Meeting, Minute, MinuteType } from '@/lib/types';
import { minuteIcon, IconDoc, IconPlus, IconTrash, IconCheck, IconClock, IconCall, IconPaperclip, IconEdit, IconList } from './Icons';

/** انواعی که کاربر می‌تواند ثبت کند — بقیه فقط در دادهٔ قدیمی دیده می‌شوند */
const order: MinuteType[] = ['note', 'reminder'];
/** انواعی که وضعیت انجام دارند */
const DONEABLE = new Set<MinuteType>(['reminder', 'call']);

export default function MinutesEditor({ meeting }: { meeting: Meeting }) {
  const store = useStore();
  const list = store.minutes[meeting.id] ?? [];
  /* پیش‌فرض روی سطلِ خودِ کاربر است، نه «عمومی» — آدم معمولاً می‌آید چیزی
     برای خودش بنویسد؛ اگر در این جلسه نباشد، عمومی می‌ماند. */
  const [activeP, setActiveP] = useState<string>(
    () => (meeting.parts.includes(store.currentUser) ? store.currentUser : 'general'));
  const [type, setType] = useState<MinuteType>('note');
  const [text, setText] = useState('');
  const [remindDate, setRemindDate] = useState('');   // تاریخ ISO یادآوری
  const [remindHour, setRemindHour] = useState(9);    // ساعت اعشاری یادآوری
  const [agendaItem, setAgendaItem] = useState('');   // اختیاری — این آیتم ذیل کدام بند مطرح شد

  const [saving, setSaving] = useState(false);
  const bucketList = list.filter((m) => (activeP === 'general' ? !m.participant : m.participant === activeP));
  const bucketOf = (pid: string) => list.filter((m) => (pid === 'general' ? !m.participant : m.participant === pid)).length;

  async function add() {
    if (!text.trim()) { store.toast('متن صورت‌جلسه را بنویسید', 'info'); return; }
    setSaving(true);
    await store.addMinute({
      meeting: meeting.id,
      participant: activeP === 'general' ? null : activeP,
      type,
      text: text.trim(),
      remindDate: type === 'reminder' ? (remindDate || todayISO()) : null,
      remindHour: type === 'reminder' ? remindHour : null,
      agendaItem: agendaItem || null,
    });
    setSaving(false);
    setText(''); setRemindDate(''); setRemindHour(9); setAgendaItem('');
    store.toast(`${minuteMeta[type].label} ثبت شد`, 'ok');
  }

  // شمارش از روی خودِ آیتم‌ها می‌آید تا نوع‌های قدیمی هم بی‌صدا گم نشوند
  const counts = (Object.keys(minuteMeta) as MinuteType[])
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

      {/* سطل هر شرکت‌کننده؛ «عمومی» ته فهرست می‌ماند چون اسم‌ها اول خوانده می‌شوند */}
      <div className="p-buckets">
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
        <button className={'pb' + (activeP === 'general' ? ' active' : '')} onClick={() => setActiveP('general')}>
          عمومی{bucketOf('general') > 0 && <span className="pb-n num">{toFa(bucketOf('general'))}</span>}
        </button>
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

        {/* Enter خط تازه می‌سازد و همان‌طور هم ذخیره و نمایش داده می‌شود؛
            برای ثبت سریع، Ctrl/⌘+Enter. */}
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          placeholder={placeholderFor(type)} rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
        <small className="composer-hint">Enter خط تازه · Ctrl+Enter ثبت</small>

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
            ? 'صورت‌جلسهٔ عمومی خالی است — یادداشت یا یادآور اضافه کنید.'
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
  const [rDate, setRDate] = useState(m.remindDate ?? '');
  const [rHour, setRHour] = useState(m.remindHour ?? 9);
  const [who, setWho] = useState(m.who ?? '');
  const [phone, setPhone] = useState(m.phone ?? '');
  const [item, setItem] = useState(m.agendaItem ?? '');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setText(m.text);
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
        <button className={'done-check' + (m.done ? ' on' : '')} onClick={() => store.toggleDone(mid, m.id)} aria-label="انجام شد">
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
          {m.type === 'reminder' && remindLabel(m) && <span><IconClock size={12} />{remindLabel(m)}</span>}
          {m.type === 'reminder' && m.remindDate && !m.done && <DueBadge iso={m.remindDate} />}
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
  return t === 'reminder' ? 'چه چیزی را باید یادآوری کرد؟' : 'یادداشت آزاد از جلسه…';
}
function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return toFa(`${hh}:${mm}`);
}
