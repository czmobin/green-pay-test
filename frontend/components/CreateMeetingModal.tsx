'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { dayNames, typeLabels, toFa, fmtTime, normalizeFa, priorityLabels, priorityColor } from '@/lib/data';
import type { MeetingType, Priority } from '@/lib/types';
import { api, type Conflict } from '@/lib/api';
import { IconX, IconPlus, IconDashboard, IconGuests, IconRoom, IconVideo, IconSearch } from './Icons';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];

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
  const [cat, setCat] = useState('');
  const [type, setType] = useState<MeetingType>('internal');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(10);
  const [end, setEnd] = useState(11);
  const [room, setRoom] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const [pq, setPq] = useState('');
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<Priority>('normal');
  const [meetLink, setMeetLink] = useState('');
  const [liveConflicts, setLiveConflicts] = useState<Conflict[]>([]);

  // مقادیر پیش‌فرض پس از رسیدن داده از API
  const categoryIds = Object.keys(store.categories);
  const roomIds = Object.keys(store.rooms);
  const defaultCat = categoryIds[0] ?? '';
  const defaultRoom = roomIds[0] ?? '';
  const onlineRoom = Object.values(store.rooms).find((r) => r.is_online)?.id ?? defaultRoom;
  const selectedCat = cat || defaultCat;
  const selectedRoom = type === 'online' ? onlineRoom : (room || defaultRoom);
  const selectedParts = parts.length ? parts : (store.currentUser ? [store.currentUser] : []);

  const filteredPeople = useMemo(() => {
    const nq = normalizeFa(pq);
    return Object.values(store.people).filter((p) => !nq || normalizeFa(p.name + ' ' + p.role).includes(nq));
  }, [pq, store.people]);

  /* هشدار زندهٔ تداخل: با تغییر زمان یا شرکت‌کنندگان بررسی می‌شود.
     صرفاً نمایشی است و هیچ‌وقت مانع انتخاب فرد یا ثبت جلسه نمی‌شود. */
  const partsKey = selectedParts.join(',');
  useEffect(() => {
    if (!store.createOpen || !partsKey) { setLiveConflicts([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.checkConflicts({ day, start, end, parts: partsKey.split(',') })
        .then((r) => { if (alive) setLiveConflicts(r.conflicts); })
        .catch(() => { if (alive) setLiveConflicts([]); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [store.createOpen, partsKey, day, start, end]);

  function reset() {
    setTitle(''); setCat(''); setType('internal'); setDay(1); setStart(10); setEnd(11);
    setRoom(''); setParts([]); setPq(''); setPriority('normal'); setMeetLink('');
    setLiveConflicts([]);
  }
  function onStart(v: number) { setStart(v); if (end <= v) setEnd(Math.min(v + 1, 18)); }
  function toggle(id: string) {
    setParts(() => {
      const cur = selectedParts;
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { store.toast('عنوان جلسه را وارد کنید', 'info'); return; }
    if (end <= start) { store.toast('ساعت پایان باید بعد از شروع باشد', 'info'); return; }
    if (!selectedCat || !selectedRoom || !store.currentUser) { store.toast('داده‌ها هنوز آماده نیست', 'info'); return; }

    setSaving(true);
    const created = await store.createMeeting({
      title: title.trim(), category: selectedCat, type, day, start, end,
      room: selectedRoom, organizer: store.currentUser, parts: selectedParts,
      guests: [], synced: store.gcalConnected, priority, meetLink: meetLink.trim(),
    });
    setSaving(false);
    if (!created) return;

    store.closeCreate();
    store.toast(store.gcalConnected ? 'جلسه ساخته و با Google Calendar همگام شد' : 'جلسهٔ جدید ساخته شد', 'ok');
    reset();
    router.push(`/meetings/${created.id}`);
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
            <select className="field-in" value={selectedCat} onChange={(e) => setCat(e.target.value)}>
              {Object.values(store.categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              <select className="field-in" value={selectedRoom} disabled={type === 'online'} onChange={(e) => setRoom(e.target.value)}>
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

          <div className="field">
            <label>لینک یا شناسهٔ Google Meet <span className="opt">(اختیاری)</span></label>
            <input className="field-in" dir="ltr" value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
              placeholder="abc-defg-hij یا https://meet.google.com/…" />
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
            <label>شرکت‌کنندگان ({toFa(selectedParts.length)})</label>
            <div className="pp-search">
              <IconSearch size={15} />
              <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="جستجوی نام یا سمت…" />
            </div>
            <div className="people-pick">
              {filteredPeople.map((p) => (
                <button type="button" key={p.id} className={'ppick' + (selectedParts.includes(p.id) ? ' active' : '')} onClick={() => toggle(p.id)}>
                  <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                  {p.name}
                  {liveConflicts.some((c) => c.user === p.id) && (
                    <span className="ppick-warn" title="در این بازه جلسهٔ دیگری دارد">!</span>
                  )}
                </button>
              ))}
              {filteredPeople.length === 0 && <div className="empty-hint" style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>کسی پیدا نشد.</div>}
            </div>

            {liveConflicts.length > 0 && (
              <div className="conflict-hint">
                <span className="ch-ic">!</span>
                <span>
                  {Array.from(new Set(liveConflicts.map((c) => c.userName))).join('، ')} در این بازه
                  جلسهٔ دیگری {liveConflicts.length > 1 ? 'دارند' : 'دارد'} — می‌توانید همچنان اضافه‌شان کنید.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={store.closeCreate}>انصراف</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <IconPlus size={16} />{saving ? 'در حال ذخیره…' : 'ساخت جلسه'}
          </button>
        </div>
      </form>
    </div>
  );
}
