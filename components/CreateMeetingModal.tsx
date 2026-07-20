'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { people, rooms, categories, dayNames, typeLabels, toFa, fmtTime, normalizeFa } from '@/lib/data';
import type { MeetingType } from '@/lib/types';
import { IconX, IconPlus, IconDashboard, IconGuests, IconRoom, IconVideo, IconSearch } from './Icons';

const types: { id: MeetingType; icon: React.ReactNode }[] = [
  { id: 'internal', icon: <IconDashboard size={16} /> },
  { id: 'external', icon: <IconGuests size={16} /> },
  { id: 'board', icon: <IconRoom size={16} /> },
  { id: 'online', icon: <IconVideo size={16} /> },
];
const slots = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18];

export default function CreateMeetingModal() {
  const store = useStore();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('greenpay');
  const [type, setType] = useState<MeetingType>('internal');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(10);
  const [end, setEnd] = useState(11);
  const [room, setRoom] = useState('damavand');
  const [parts, setParts] = useState<string[]>(['ceo']);
  const [pq, setPq] = useState('');

  const filteredPeople = useMemo(() => {
    const nq = normalizeFa(pq);
    return Object.values(people).filter((p) => !nq || normalizeFa(p.name + ' ' + p.role).includes(nq));
  }, [pq]);

  function reset() {
    setTitle(''); setCat('greenpay'); setType('internal'); setDay(1); setStart(10); setEnd(11);
    setRoom('damavand'); setParts(['ceo']); setPq('');
  }
  function onStart(v: number) { setStart(v); if (end <= v) setEnd(Math.min(v + 1, 18)); }
  function toggle(id: string) { setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('عنوان جلسه را وارد کنید', 'info'); return; }
    if (end <= start) { store.toast('ساعت پایان باید بعد از شروع باشد', 'info'); return; }
    const id = 'x' + Date.now().toString(36);
    store.addMeeting({
      id, title: title.trim(), category: cat, type, status: 'confirmed', day, start, end,
      room: type === 'online' ? 'online' : room, organizer: 'ceo', parts, guests: [],
      synced: store.gcalConnected, agenda: [],
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
            <label>دسته‌بندی جلسه</label>
            <select className="field-in" value={cat} onChange={(e) => setCat(e.target.value)}>
              {Object.values(categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
              <label>محل جلسه</label>
              <select className="field-in" value={type === 'online' ? 'online' : room} disabled={type === 'online'} onChange={(e) => setRoom(e.target.value)}>
                {Object.values(rooms).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

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
                <button type="button" key={p.id} className={'ppick' + (parts.includes(p.id) ? ' active' : '')} onClick={() => toggle(p.id)}>
                  <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                  {p.name}
                </button>
              ))}
              {filteredPeople.length === 0 && <div className="empty-hint" style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>کسی پیدا نشد.</div>}
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
