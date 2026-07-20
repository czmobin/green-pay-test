'use client';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import { typeLabels, TODAY, NOW_HOUR, fmtTime, toFa, dayNames } from '@/lib/data';
import {
  IconCalendar, IconClock, IconGuests, IconRoom, IconMapPin, IconChevron, IconVideo, IconCheck, IconX,
} from '@/components/Icons';

export default function Dashboard() {
  const store = useStore();
  const router = useRouter();
  const rooms = store.rooms;
  const today = store.meetings.filter((m) => m.day === TODAY).sort((a, b) => a.start - b.start);
  const next = today.find((m) => m.start >= NOW_HOUR) ?? today[today.length - 1];
  const pending = store.meetings.filter((m) => m.status === 'pending').length;
  const guestCount = new Set(today.flatMap((m) => m.guests)).size;
  const roomCount = new Set(today.map((m) => m.room)).size;
  const invites = store.meetings.filter((m) => m.status === 'pending').sort((a, b) => a.day - b.day || a.start - b.start);

  return (
    <>
      <div className="page-head">
        <h1>سلام، علیرضا 👋</h1>
        <p>یکشنبه ۲۲ تیر ۱۴۰۴ — امروز {toFa(today.length)} جلسه دارید.</p>
      </div>

      {next && (
        <div className="next-card" onClick={() => router.push(`/meetings/${next.id}`)} role="button" style={{ cursor: 'pointer' }}>
          <span className="glow" />
          <div className="eyebrow"><span className="live" />جلسهٔ بعدی شما</div>
          <h2>{next.title}</h2>
          <div className="nm-meta">
            <span><IconClock size={14} /><span className="num">{fmtTime(next.start)} – {fmtTime(next.end)}</span></span>
            <span>{next.type === 'online' ? <IconVideo size={14} /> : <IconMapPin size={14} />}{rooms[next.room]?.name ?? '—'}</span>
            {next.guests.length > 0 && <span><IconGuests size={14} />{toFa(next.guests.length)} مهمان خارجی</span>}
          </div>
          <div className="nm-actions">
            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); router.push(`/meetings/${next.id}`); }}>
              باز کردن و نوشتن صورت‌جلسه
            </button>
            {next.type === 'online' && (
              <button className="btn btn-join" onClick={(e) => { e.stopPropagation(); store.toast('در حال باز کردن Google Meet…', 'ok'); }}>
                <IconVideo size={16} />پیوستن
              </button>
            )}
          </div>
        </div>
      )}

      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--mint-soft)', color: 'var(--brand-strong)' }}><IconCalendar size={18} /></div>
          <div className="lbl">جلسات امروز</div>
          <div className="val num">{toFa(today.length)} <small>جلسه</small></div>
        </div>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><IconClock size={18} /></div>
          <div className="lbl">در انتظار تأیید</div>
          <div className="val num">{toFa(pending)} <small>دعوت</small></div>
        </div>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><IconGuests size={18} /></div>
          <div className="lbl">مهمان خارجی امروز</div>
          <div className="val num">{toFa(guestCount)} <small>نفر</small></div>
        </div>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><IconRoom size={18} /></div>
          <div className="lbl">اتاق‌های امروز</div>
          <div className="val num">{toFa(roomCount)} <small>اتاق</small></div>
        </div>
      </div>

      {invites.length > 0 && (
        <>
          <div className="section-title">
            <h2>دعوت‌نامه‌های در انتظار پاسخ</h2>
            <span className="num" style={{ color: 'var(--muted)', fontSize: 12.5 }}>{toFa(invites.length)}</span>
          </div>
          <div className="mlist">
            {invites.map((m) => (
              <div className="invite" key={m.id}>
                <div className="ib" onClick={() => router.push(`/meetings/${m.id}`)} style={{ cursor: 'pointer' }}>
                  <b>{m.title}</b>
                  <small>
                    <span className="num"><IconClock size={12} />{dayNames[m.day]} · {fmtTime(m.start)}</span>
                    <span>{m.type === 'online' ? <IconVideo size={12} /> : <IconMapPin size={12} />}{rooms[m.room]?.name ?? '—'}</span>
                  </small>
                </div>
                <div className="iacts">
                  <button className="yes" aria-label="پذیرش" onClick={() => { store.respondMeeting(m.id, true); store.toast('دعوت پذیرفته شد', 'ok'); }}><IconCheck size={17} /></button>
                  <button className="no" aria-label="رد" onClick={() => { store.respondMeeting(m.id, false); store.toast('دعوت رد شد', 'info'); }}><IconX size={17} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <h2>برنامهٔ امروز</h2>
        <Link href="/calendar">تقویم هفته</Link>
      </div>
      <div className="mlist">
        {today.map((m) => <MeetingRow key={m.id} m={m} />)}
      </div>
    </>
  );
}
