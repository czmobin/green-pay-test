'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { typeLabels, toFa, fmtTime, normalizeFa, priorityLabels, priorityColor, todayISO, addDaysISO, faDate } from '@/lib/data';
import type { Meeting, MeetingType, Priority } from '@/lib/types';
import { IconX, IconCheck, IconDashboard, IconGuests, IconRoom, IconVideo, IconSearch } from './Icons';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];
const types: { id: MeetingType; icon: React.ReactNode }[] = [
  { id: 'internal', icon: <IconDashboard size={16} /> },
  { id: 'external', icon: <IconGuests size={16} /> },
  { id: 'board', icon: <IconRoom size={16} /> },
  { id: 'online', icon: <IconVideo size={16} /> },
];
const slots = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5, 19];

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

  const today = todayISO();
  // بازهٔ انتخاب: از ۳۰ روز قبل تا ۶۰ روز بعد (تا جلسات گذشته هم قابل ویرایش باشند)
  const dateOptions = useMemo(
    () => Array.from({ length: 90 }, (_, i) => addDaysISO(today, i - 30)),
    [today]);
  const dates = dateOptions.includes(date) ? dateOptions : [date, ...dateOptions];

  const filteredPeople = useMemo(() => {
    const nq = normalizeFa(pq);
    const all = Object.values(store.people);
    if (nq) return all.filter((p) => normalizeFa(p.name + ' ' + p.role).includes(nq));
    return all.filter((p) => parts.includes(p.id)).concat(all.filter((p) => !parts.includes(p.id)).slice(0, 10));
  }, [pq, store.people, parts]);

  function toggle(id: string) {
    setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function onStart(v: number) { setStart(v); if (end <= v) setEnd(Math.min(v + 1, 19)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('عنوان جلسه را وارد کنید', 'info'); return; }
    if (end <= start) { store.toast('ساعت پایان باید بعد از شروع باشد', 'info'); return; }
    setSaving(true);
    const updated = await store.updateMeeting(meeting.id, {
      title: title.trim(), category: cat, type, date, start, end, room,
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
              <select className="field-in" value={date} onChange={(e) => setDate(e.target.value)}>
                {dates.map((iso) => (
                  <option key={iso} value={iso}>{iso === today ? `امروز · ${faDate(iso)}` : faDate(iso)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>محل جلسه</label>
              <select className="field-in" value={room ?? ''} onChange={(e) => setRoom(e.target.value)}>
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
              <label>لینک یا شناسهٔ جلسهٔ آنلاین <span className="opt">(اختیاری)</span></label>
              <input className="field-in" dir="ltr" value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
                placeholder="abc-defg-hij یا https://meet.google.com/…" />
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>ساعت شروع</label>
              <select className="field-in num" value={start} onChange={(e) => onStart(Number(e.target.value))}>
                {slots.slice(0, -1).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>ساعت پایان</label>
              <select className="field-in num" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
                {slots.filter((h) => h > start).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
              </select>
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
