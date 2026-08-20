'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { typeLabels, toFa, fmtTime, normalizeFa, priorityLabels, priorityColor, todayISO } from '@/lib/data';
import type { MeetingType, Priority } from '@/lib/types';
import { api, type Conflict, type RoomConflict } from '@/lib/api';
import DatePicker from './DatePicker';
import { useSheet } from './useSheet';
import TimePicker from './TimePicker';
import { IconX, IconPlus, IconRoom, IconVideo, IconSearch } from './Icons';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];

/** فاصله‌های آمادهٔ یادآور (دقیقه) */
const LEADS = [0, 15, 30, 60, 120, 1440] as const;

/** «۹۰» → «۱ ساعت و ۳۰ دقیقه قبل» */
function leadLabel(min: number): string {
  if (min <= 0) return 'بدون یادآور';
  if (min % 1440 === 0) return `${toFa(min / 1440)} روز قبل`;
  if (min % 60 === 0) return `${toFa(min / 60)} ساعت قبل`;
  if (min < 60) return `${toFa(min)} دقیقه قبل`;
  return `${toFa(Math.floor(min / 60))} ساعت و ${toFa(min % 60)} دقیقه قبل`;
}

const types: { id: MeetingType; icon: React.ReactNode }[] = [
  { id: 'in_person', icon: <IconRoom size={16} /> },
  { id: 'online', icon: <IconVideo size={16} /> },
];

export default function CreateMeetingModal() {
  const store = useStore();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState<MeetingType>('in_person');
  const [date, setDate] = useState('');
  const [start, setStart] = useState(10);
  const [end, setEnd] = useState(11);
  const [room, setRoom] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const [pq, setPq] = useState('');
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<Priority>('normal');
  const [meetLink, setMeetLink] = useState('');
  const [reminderLead, setReminderLead] = useState<number>(60);
  const [leadCustom, setLeadCustom] = useState(false);   // فاصلهٔ دلخواه باز است؟
  const [leadText, setLeadText] = useState('');
  const [guests, setGuests] = useState<string[]>([]);
  const [guestOpen, setGuestOpen] = useState(false);
  const [gName, setGName] = useState('');
  const [gOrg, setGOrg] = useState('');
  const [gBusy, setGBusy] = useState(false);
  const [liveConflicts, setLiveConflicts] = useState<Conflict[]>([]);
  const [liveRoomConflicts, setLiveRoomConflicts] = useState<RoomConflict[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /* فرم فقط بعد از ساختِ موفق خالی می‌شود؛ بستنِ ساده پیش‌نویس را نگه می‌دارد.
     خالی‌کردن به پایان انیمیشن موکول می‌شود تا وسط بسته‌شدن، فرم جلوی چشم
     کاربر پاک نشود. */
  const justCreated = useRef(false);
  const { setBox, dismiss } = useSheet(store.createOpen, () => {
    store.closeCreate();
    if (justCreated.current) { justCreated.current = false; reset(); }
  });

  // مقادیر پیش‌فرض پس از رسیدن داده از API
  const categoryIds = Object.keys(store.categories);
  const defaultCat = categoryIds[0] ?? '';
  const selectedCat = cat || defaultCat;
  // جلسهٔ آنلاین محل فیزیکی ندارد؛ محل هم پیش‌فرض نمی‌گیرد تا ناخواسته
  // اولین اتاق فهرست ثبت نشود — کاربر خودش انتخاب می‌کند.
  const selectedRoom = type === 'online' ? '' : room;
  const selectedParts = parts.length ? parts : (store.currentUser ? [store.currentUser] : []);
  const today = todayISO();
  const selectedDate = date || today;

  /* پیشنهاد: ۱۰ نفری که کاربر جاری بیشترین جلسهٔ مشترک را با آن‌ها داشته،
     به‌ترتیبِ همان تکرار. بقیه با جستجو پیدا می‌شوند. */
  const frequent = useMemo(() => {
    const count = new Map<string, number>();
    store.meetings
      .filter((m) => m.organizer === store.currentUser || m.parts.includes(store.currentUser))
      .forEach((m) => m.parts.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1)));
    return Object.values(store.people)
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((p) => p.id);
  }, [store.meetings, store.people, store.currentUser]);

  /**
   * حداکثر ۱۰ نفر، به‌ترتیب پرتکرارترین. انتخاب‌شده‌ها اول می‌آیند تا هیچ‌وقت
   * از فهرست بیرون نیفتند؛ بقیه با جستجو پیدا می‌شوند.
   */
  const filteredPeople = useMemo(() => {
    const nq = normalizeFa(pq);
    const all = Object.values(store.people);
    if (nq) return all.filter((p) => normalizeFa(p.name + ' ' + p.role).includes(nq));
    const ids = [...selectedParts, ...frequent.filter((id) => !selectedParts.includes(id))];
    return ids.slice(0, 10)
      .map((id) => store.people[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [pq, store.people, frequent, selectedParts]);

  const hiddenCount = Object.keys(store.people).length - filteredPeople.length;

  /* هشدار زندهٔ تداخل: با تغییر زمان یا شرکت‌کنندگان بررسی می‌شود.
     صرفاً نمایشی است و هیچ‌وقت مانع انتخاب فرد یا ثبت جلسه نمی‌شود. */
  const partsKey = selectedParts.join(',');
  useEffect(() => {
    if (!store.createOpen || (!partsKey && !selectedRoom)) {
      setLiveConflicts([]); setLiveRoomConflicts([]); return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api.checkConflicts({
        date: selectedDate, start, end,
        parts: partsKey ? partsKey.split(',') : [],
        room: selectedRoom || undefined,
      })
        .then((r) => {
          if (!alive) return;
          setLiveConflicts(r.conflicts);
          setLiveRoomConflicts(r.roomConflicts ?? []);
        })
        .catch(() => { if (alive) { setLiveConflicts([]); setLiveRoomConflicts([]); } });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [store.createOpen, partsKey, selectedRoom, selectedDate, start, end]);

  function reset() {
    setConfirmOpen(false);
    setTitle(''); setCat(''); setType('in_person'); setStart(10); setEnd(11);
    setRoom(''); setParts([]); setPq(''); setPriority('normal'); setMeetLink(''); setDate('');
    setGuests([]); setGuestOpen(false); setGName(''); setGOrg(''); setReminderLead(60);
    setLeadCustom(false); setLeadText('');
    setLiveConflicts([]); setLiveRoomConflicts([]);
  }
  function onStart(v: number) { setStart(v); if (end <= v) setEnd(Math.min(v + 1, 23.75)); }
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
    if (!selectedCat || !store.currentUser) { store.toast('داده‌ها هنوز آماده نیست', 'info'); return; }
    if (leadCustom && (!leadText || Number(leadText) < 1 || Number(leadText) > 10080)) {
      store.toast('فاصلهٔ یادآور را بین ۱ دقیقه تا ۷ روز بنویسید', 'info'); return;
    }

    // اگر تداخلی هست — چه افراد، چه محل — اول تأیید بگیر
    if ((liveConflicts.length > 0 || liveRoomConflicts.length > 0) && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    await doCreate();
  }

  async function doCreate() {
    setConfirmOpen(false);
    setSaving(true);
    const created = await store.createMeeting({
      title: title.trim(), category: selectedCat, type, date: selectedDate, start, end,
      room: selectedRoom || '', organizer: store.currentUser, parts: selectedParts,
      guests, priority, reminderLead, meetLink: type === 'online' ? meetLink.trim() : '',
    });
    setSaving(false);
    if (!created) return;

    justCreated.current = true;
    dismiss();
    store.toast('جلسهٔ جدید ساخته شد', 'ok');
    router.push(`/meetings/${created.id}`);
  }

  return (
    <div className={'modal-overlay' + (store.createOpen ? ' show' : '')} onClick={dismiss}>
      <form className="modal" ref={setBox} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <span className="grip" />
          <h2>جلسهٔ جدید</h2>
          <button type="button" className="icon-btn close" onClick={dismiss} aria-label="بستن"><IconX size={18} /></button>
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
              <label>روز جلسه</label>
              <DatePicker value={selectedDate} onChange={setDate} />
            </div>
            <div className="field">
              <label>محل جلسه</label>
              <select className="field-in" value={selectedRoom} disabled={type === 'online'} onChange={(e) => setRoom(e.target.value)}>
                <option value="">{type === 'online' ? '— جلسهٔ آنلاین —' : '— بدون محل —'}</option>
                {Object.values(store.rooms).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          {/* تداخل محل: اتاق برخلاف آدم قابل تقسیم نیست، پس همین‌جا زیر
              انتخاب محل هشدار می‌دهیم — همان‌جا که تصمیمش گرفته می‌شود */}
          {liveRoomConflicts.length > 0 && (
            <div className="conflict-hint room">
              <span className="ch-ic">!</span>
              <span>
                این محل در همین بازه {toFa(liveRoomConflicts.length)} جلسهٔ دیگر دارد
                ({liveRoomConflicts.slice(0, 2).map((c) => c.meetingTitle).join('، ')}
                {liveRoomConflicts.length > 2 ? ' و…' : ''}) — می‌توانید همچنان ثبت کنید.
              </span>
            </div>
          )}

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
            <label>یادآور پیامکی برای شرکت‌کنندگان</label>
            <div className="rl-picks">
              {LEADS.map((v) => (
                <button type="button" key={v}
                  className={'chip-btn' + (reminderLead === v ? ' active' : '')}
                  onClick={() => { setReminderLead(v); setLeadCustom(false); }}>
                  {leadLabel(v)}
                </button>
              ))}
              {/* فاصلهٔ دلخواه: هر عددی بین ۱ دقیقه تا ۷ روز */}
              <button type="button"
                className={'chip-btn' + (leadCustom ? ' active' : '')}
                onClick={() => setLeadCustom((v) => !v)}>دلخواه</button>
            </div>

            {leadCustom && (
              <div className="rl-custom">
                <input className="field-in num" inputMode="numeric" value={leadText}
                  placeholder="۹۰" aria-label="فاصلهٔ یادآور به دقیقه"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setLeadText(raw);
                    const n = Number(raw);
                    if (n >= 1 && n <= 10080) setReminderLead(n);
                  }} />
                <span>دقیقه پیش از جلسه</span>
                {leadText && (Number(leadText) < 1 || Number(leadText) > 10080)
                  ? <b className="rl-bad">بین ۱ دقیقه تا ۷ روز</b>
                  : leadText && <b className="rl-ok">{leadLabel(Number(leadText))}</b>}
              </div>
            )}

            <small className="fhint">این تنظیم برای همه ثبت می‌شود؛ بعداً هر کس می‌تواند مالِ خودش را عوض کند.</small>
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
            {!pq && hiddenCount > 0 && (
              <div className="pp-more">{toFa(hiddenCount)} نفر دیگر — برای دیدنشان جستجو کنید.</div>
            )}

            {/* مهمان خارجی: هر کاربری می‌تواند بسازد و به همین جلسه اضافه کند */}
            <div className="guest-box">
              <div className="gb-head">
                <span>مهمان خارجی ({toFa(guests.length)})</span>
                <button type="button" className="gb-add" onClick={() => setGuestOpen((v) => !v)}>
                  {guestOpen ? 'بستن' : '+ افزودن مهمان'}
                </button>
              </div>

              {guests.length > 0 && (
                <div className="gb-list">
                  {guests.map((id) => (
                    <span className="gb-chip" key={id}>
                      {store.guests[id]?.name ?? id}
                      <button type="button" onClick={() => setGuests((g) => g.filter((x) => x !== id))}
                        aria-label="حذف مهمان"><IconX size={12} /></button>
                    </span>
                  ))}
                </div>
              )}

              {guestOpen && (
                <div className="gb-form">
                  <input className="field-in" value={gName} onChange={(e) => setGName(e.target.value)}
                    placeholder="نام و نام خانوادگی" />
                  <input className="field-in" value={gOrg} onChange={(e) => setGOrg(e.target.value)}
                    placeholder="سازمان (اختیاری)" />
                  <button type="button" className="btn btn-ghost" disabled={gBusy} onClick={async () => {
                    if (!gName.trim()) { store.toast('نام مهمان را وارد کنید', 'info'); return; }
                    setGBusy(true);
                    const g = await store.addGuest({ name: gName.trim(), org: gOrg.trim() });
                    setGBusy(false);
                    if (g) {
                      setGuests((list) => [...list, g.id]);
                      setGName(''); setGOrg(''); setGuestOpen(false);
                      store.toast('مهمان اضافه شد', 'ok');
                    }
                  }}>{gBusy ? '…' : 'ثبت'}</button>
                </div>
              )}
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

        {confirmOpen && (
          <div className="confirm-layer" onClick={() => setConfirmOpen(false)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <div className="cb-head"><span className="ch-ic">!</span><b>تداخل زمانی</b></div>
              {liveRoomConflicts.length > 0 && (
                <p>
                  محل «{store.rooms[selectedRoom]?.name ?? '—'}» در این بازه
                  {' '}{toFa(liveRoomConflicts.length)} جلسهٔ دیگر دارد.
                </p>
              )}
              {liveConflicts.length > 0 && (
                <p>
                  {Array.from(new Set(liveConflicts.map((c) => c.userName))).join('، ')} در این بازه
                  جلسهٔ دیگری {liveConflicts.length > 1 ? 'دارند' : 'دارد'}.
                </p>
              )}
              <p>آیا جلسه ساخته شود؟</p>
              <ul className="cb-list">
                {liveRoomConflicts.slice(0, 3).map((c, i) => (
                  <li key={'r' + i}><b>محل</b><span>{c.meetingTitle}</span>
                    <span className="num">{fmtTime(c.start)}–{fmtTime(c.end)}</span></li>
                ))}
                {liveConflicts.slice(0, 3).map((c, i) => (
                  <li key={'u' + i}><b>{c.userName}</b><span>{c.meetingTitle}</span>
                    <span className="num">{fmtTime(c.start)}–{fmtTime(c.end)}</span></li>
                ))}
              </ul>
              <div className="cb-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>بازگشت</button>
                <button type="button" className="btn btn-primary" onClick={doCreate} disabled={saving}>
                  {saving ? 'در حال ذخیره…' : 'بله، جلسه ساخته شود'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={dismiss}>انصراف</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <IconPlus size={16} />{saving ? 'در حال ذخیره…' : 'ساخت جلسه'}
          </button>
        </div>
      </form>
    </div>
  );
}
