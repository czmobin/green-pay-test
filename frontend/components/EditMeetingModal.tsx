'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { typeLabels, toFa, normalizeFa, priorityLabels, priorityColor } from '@/lib/data';
import type { Meeting, MeetingType, Priority } from '@/lib/types';
import DatePicker from './DatePicker';
import TimePicker from './TimePicker';
import { IconX, IconCheck, IconRoom, IconVideo, IconSearch } from './Icons';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];
const types: { id: MeetingType; icon: React.ReactNode }[] = [
  { id: 'in_person', icon: <IconRoom size={16} /> },
  { id: 'online', icon: <IconVideo size={16} /> },
];

/** ویرایش جلسه — همان فیلدهای ساخت، از دکمهٔ ویرایش صفحهٔ جلسه باز می‌شود. */
export default function EditMeetingModal(
  { meeting, open, onClose }: { meeting: Meeting; open: boolean; onClose: () => void },
) {
  const store = useStore();
  const [title, setTitle] = useState(meeting.title);
  const [cat, setCat] = useState(meeting.category);
  const [type, setType] = useState<MeetingType>(meeting.type);
  const [date, setDate] = useState(meeting.date);
  const [start, setStart] = useState(meeting.start);
  const [end, setEnd] = useState(meeting.end);
  const [room, setRoom] = useState(meeting.room);
  const [priority, setPriority] = useState<Priority>(meeting.priority ?? 'normal');
  const [meetLink, setMeetLink] = useState(meeting.meetLink ?? '');
  const [parts, setParts] = useState<string[]>(meeting.parts);
  const [pq, setPq] = useState('');
  const [saving, setSaving] = useState(false);

  // با هر بار باز شدن، مقادیر از جلسهٔ فعلی خوانده می‌شوند
  useEffect(() => {
    if (!open) return;
    setTitle(meeting.title); setCat(meeting.category); setType(meeting.type);
    setDate(meeting.date); setStart(meeting.start); setEnd(meeting.end);
    setRoom(meeting.room); setPriority(meeting.priority ?? 'normal');
    setMeetLink(meeting.meetLink ?? ''); setParts(meeting.parts); setPq('');
  }, [open, meeting]);

  const filteredPeople = useMemo(() => {
    const nq = normalizeFa(pq);
    const all = Object.values(store.people);
    if (nq) return all.filter((p) => normalizeFa(p.name + ' ' + p.role).includes(nq));
    return all.filter((p) => parts.includes(p.id)).concat(all.filter((p) => !parts.includes(p.id)).slice(0, 10));
  }, [pq, store.people, parts]);

  function toggle(id: string) {
    setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function onStart(v: number) { setStart(v); if (end <= v) setEnd(Math.min(v + 1, 23.75)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('عنوان جلسه را وارد کنید', 'info'); return; }
    if (end <= start) { store.toast('ساعت پایان باید بعد از شروع باشد', 'info'); return; }
    setSaving(true);
    const updated = await store.updateMeeting(meeting.id, {
      title: title.trim(), category: cat, type, date, start, end,
      room: type === 'online' ? '' : room,
      priority, meetLink: type === 'online' ? meetLink.trim() : '', parts,
    });
    setSaving(false);
    if (updated) { store.toast('جلسه به‌روزرسانی شد', 'ok'); onClose(); }
  }

  return (
    <div className={'modal-overlay' + (open ? ' show' : '')} onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="grip" />
          <h2>ویرایش جلسه</h2>
          <button type="button" className="icon-btn close" onClick={onClose} aria-label="بستن"><IconX size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>عنوان جلسه</label>
            <input className="field-in" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field">
            <label>دسته‌بندی جلسه</label>
            <select className="field-in" value={cat} onChange={(e) => setCat(e.target.value)}>
              {Object.values(store.categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>نوع جلسه</label>
            <div className="pick-grid">
              {types.map((t) => (
                <button type="button" key={t.id} className={'pick' + (type === t.id ? ' active' : '')}
                  onClick={() => setType(t.id)}>{t.icon}{typeLabels[t.id]}</button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>روز جلسه</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="field">
              <label>محل جلسه</label>
              <select className="field-in" value={type === 'online' ? '' : (room ?? '')}
                disabled={type === 'online'} onChange={(e) => setRoom(e.target.value)}>
                <option value="">— بدون محل —</option>
                {Object.values(store.rooms).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>اولویت جلسه</label>
            <div className="prio-pick">
              {PRIORITIES.map((pr) => (
                <button type="button" key={pr} className={'prio' + (priority === pr ? ' active' : '')}
                  style={priority === pr ? { borderColor: priorityColor[pr], background: `color-mix(in srgb,${priorityColor[pr]} 14%,transparent)`, color: priorityColor[pr] } : undefined}
                  onClick={() => setPriority(pr)}>
                  <i style={{ background: priorityColor[pr] }} />{priorityLabels[pr]}
                </button>
              ))}
            </div>
          </div>

          {type === 'online' && (
            <div className="field">
              <label>لینک جلسهٔ آنلاین <span className="opt">(اختیاری)</span></label>
              <input className="field-in" dir="ltr" value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://… (Google Meet، اسکای‌روم، Zoom یا هر سرویس دیگر)" />
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>ساعت شروع</label>
              <TimePicker value={start} onChange={onStart} />
            </div>
            <div className="field">
              <label>ساعت پایان</label>
              <TimePicker value={end} onChange={setEnd} />
            </div>
          </div>

          <div className="field">
            <label>شرکت‌کنندگان ({toFa(parts.length)})</label>
            <div className="pp-search">
              <IconSearch size={15} />
              <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="جستجوی نام یا سمت…" />
            </div>
            <div className="people-pick">
              {filteredPeople.map((p) => (
                <button type="button" key={p.id} className={'ppick' + (parts.includes(p.id) ? ' active' : '')}
                  onClick={() => toggle(p.id)}>
                  <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>
                    {p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <IconCheck size={16} />{saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
          </button>
        </div>
      </form>
    </div>
  );
}
