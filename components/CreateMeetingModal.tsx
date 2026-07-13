'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { people, rooms, dayNames, typeLabels } from '@/lib/data';
import type { MeetingType } from '@/lib/types';
import { IconX, IconPlus, IconDashboard, IconGuests, IconRoom, IconVideo } from './Icons';

const types: { id: MeetingType; icon: React.ReactNode }[] = [
  { id: 'internal', icon: <IconDashboard size={16} /> },
  { id: 'external', icon: <IconGuests size={16} /> },
  { id: 'board', icon: <IconRoom size={16} /> },
  { id: 'online', icon: <IconVideo size={16} /> },
];
const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const durations = [0.5, 1, 1.5, 2];

export default function CreateMeetingModal() {
  const store = useStore();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MeetingType>('internal');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(10);
  const [dur, setDur] = useState(1);
  const [room, setRoom] = useState('damavand');
  const [parts, setParts] = useState<string[]>(['ceo']);

  function reset() {
    setTitle(''); setType('internal'); setDay(1); setStart(10); setDur(1); setRoom('damavand'); setParts(['ceo']);
  }
  function toggle(id: string) {
    setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('عنوان جلسه را وارد کنید', 'info'); return; }
    const id = 'x' + Date.now().toString(36);
    store.addMeeting({
      id, title: title.trim(), type, status: 'confirmed', day, start, end: start + dur,
      room: type === 'online' ? 'online' : room, organizer: 'ceo', parts,
      guests: [], synced: store.gcalConnected, agenda: [],
    });
    store.closeCreate();
    store.toast(store.gcalConnected ? 'جلسه ساخته و با Google Calendar همگام شد' : 'جلسهٔ جدید ساخته شد', 'ok');
    reset();
    router.push(`/meetings/${id}`);
  }

  return (
    <div className={'modal-overlay' + (store.createOpen ? ' show' : '')} onClick={store.closeCreate}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="grip" />
          <h2>جلسهٔ جدید</h2>
          <button type="button" className="icon-btn close" onClick={store.closeCreate} aria-label="بستن"><IconX size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>عنوان جلسه</label>
            <input className="field-in" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: بازبینی محصول درگاه پرداخت" autoFocus />
          </div>

          <div className="field">
            <label>نوع جلسه</label>
            <div className="pick-grid">
              {types.map((t) => (
                <button type="button" key={t.id} className={'pick' + (type === t.id ? ' active' : '')} onClick={() => setType(t.id)}>
                  {t.icon}{typeLabels[t.id]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>روز</label>
              <select className="field-in" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>ساعت شروع</label>
              <select className="field-in num" value={start} onChange={(e) => setStart(Number(e.target.value))}>
                {hours.map((h) => <option key={h} value={h}>{h}:۰۰</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>مدت</label>
              <select className="field-in" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
                {durations.map((d) => <option key={d} value={d}>{d === 0.5 ? '۳۰ دقیقه' : d === 1 ? '۱ ساعت' : d === 1.5 ? '۱ ساعت و نیم' : '۲ ساعت'}</option>)}
              </select>
            </div>
            <div className="field">
              <label>اتاق</label>
              <select className="field-in" value={type === 'online' ? 'online' : room} disabled={type === 'online'} onChange={(e) => setRoom(e.target.value)}>
                {Object.values(rooms).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>شرکت‌کنندگان ({parts.length})</label>
            <div className="people-pick">
              {Object.values(people).map((p) => (
                <button type="button" key={p.id} className={'ppick' + (parts.includes(p.id) ? ' active' : '')} onClick={() => toggle(p.id)}>
                  <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={store.closeCreate}>انصراف</button>
          <button type="submit" className="btn btn-primary"><IconPlus size={16} />ساخت جلسه</button>
        </div>
      </form>
    </div>
  );
}
