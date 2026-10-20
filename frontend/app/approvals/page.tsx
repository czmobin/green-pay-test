'use client';
/**
 * جلسه‌های در انتظار تایید — فقط برای ادمین و مدیرعامل.
 *
 * محل‌هایی که در پنل ادمین پرچمِ «نیاز به تایید» دارند (مثل دفتر مدیرعامل)
 * جلسه‌شان در وضعیت «در انتظار» می‌ماند و تا تایید نشود **هیچ خبری بیرون
 * نمی‌رود**: نه پیامک ایجاد، نه پیامک تغییر، نه یادآور، نه دعوت‌نامهٔ Outlook.
 * این صفحه همان دروازه است.
 *
 * شرطِ دیدنش `canApproveMeetings` است، نه `isManager`: مدیر اجرایی اجازهٔ
 * تایید ندارد و نباید صفحه‌ای ببیند که دکمه‌هایش ۴۰۳ می‌دهند. کنترلِ واقعی
 * سمت سرور است و این فقط رابط را هم‌راستا می‌کند.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { faDateLabel, fmtTime, toFa } from '@/lib/data';
import { IconCheck, IconX, IconRoom, IconUser, IconClock } from '@/components/Icons';

export const dynamic = 'force-dynamic';

export default function ApprovalsPage() {
  const store = useStore();
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState('');
  const [reason, setReason] = useState('');

  useReveal(['.page-head', '.ap-list']);

  if (!store.canApproveMeetings) {
    return (
      <div className="page-head">
        <h1>در انتظار تایید</h1>
        <p>تایید رزرو فقط از عهدهٔ ادمین یا مدیرعامل برمی‌آید.</p>
      </div>
    );
  }

  const rows = store.pendingMeetings;

  const approve = async (id: string) => {
    setBusy(id);
    await store.approveMeeting(id);
    setBusy('');
  };

  const reject = async (id: string) => {
    setBusy(id);
    await store.rejectMeeting(id, reason.trim());
    setBusy('');
    setRejecting('');
    setReason('');
  };

  return (
    <div>
      <div className="page-head">
        <h1>در انتظار تایید</h1>
        <p>
          رزروِ این محل‌ها باید تایید شود. تا تایید نشود جلسه در تقویم، فهرست
          جلسات و رزرو محل دیده نمی‌شود و پیامکی برای شرکت‌کنندگان نمی‌رود.
          پس از تایید یا رد، به سازنده پیامک می‌رود.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="result-empty">
          <div><IconCheck size={40} /></div>
          چیزی در انتظار تایید نیست. هر جلسه‌ای که محلش تایید لازم داشته باشد همین‌جا می‌آید.
        </div>
      ) : (
        <ul className="ap-list">
          {rows.map((m) => {
            const room = store.rooms[m.room];
            const organizer = store.people[m.organizer];
            // سلسلهٔ تکرار: تاییدِ یک نوبت کلِ سلسله را تایید می‌کند، پس
            // باید معلوم باشد پشتِ این دکمه چند جلسه است.
            const siblings = m.series
              ? store.meetings.filter((x) => x.series === m.series && x.status === 'pending').length
              : 1;
            return (
              <li className="ap-card" key={m.id}>
                <div className="ap-main">
                  <Link href={`/meetings/${m.id}`} className="ap-title">{m.title}</Link>
                  <div className="ap-meta">
                    <span><IconClock size={14} />{faDateLabel(m.date)} · {fmtTime(m.start)}–{fmtTime(m.end)}</span>
                    {room && <span><IconRoom size={14} />{room.name}</span>}
                    {organizer && <span><IconUser size={14} />{organizer.name}</span>}
                  </div>
                  {siblings > 1 && (
                    <span className="pill p-pending">
                      سلسلهٔ {toFa(siblings)} جلسه‌ای — تایید همهٔ نوبت‌ها
                    </span>
                  )}
                </div>

                {rejecting === m.id ? (
                  <div className="ap-reject">
                    <input className="field-in" value={reason} autoFocus
                      placeholder="دلیل رد (اختیاری)" aria-label="دلیل رد"
                      onChange={(e) => setReason(e.target.value)} />
                    <div className="ap-actions">
                      <button className="btn btn-danger" disabled={busy === m.id}
                        onClick={() => reject(m.id)}>تایید رد</button>
                      <button className="btn btn-ghost"
                        onClick={() => { setRejecting(''); setReason(''); }}>انصراف</button>
                    </div>
                  </div>
                ) : (
                  <div className="ap-actions">
                    <button className="btn btn-primary" disabled={busy === m.id}
                      onClick={() => approve(m.id)}>
                      <IconCheck size={15} />تایید
                    </button>
                    <button className="btn btn-ghost" disabled={busy === m.id}
                      onClick={() => setRejecting(m.id)}>
                      <IconX size={15} />رد
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
