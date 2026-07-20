'use client';
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MinutesEditor from '@/components/MinutesEditor';
import {
  guests, typeLabels, statusLabels, dayNames, fmtTime, initials, toFa,
} from '@/lib/data';
import {
  IconBack, IconClock, IconMapPin, IconUsers, IconGuests, IconList, IconChevron,
  IconGoogle, IconCheck, IconVideo, IconDashboard,
} from '@/components/Icons';

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const { people, rooms } = store;
  const m = store.getMeeting(id);

  if (!m) {
    return (
      <>
        <div className="detail-top">
          <button className="back-btn" onClick={() => router.push('/meetings')}><IconBack size={18} /></button>
        </div>
        <div className="empty" style={{ marginTop: 40 }}>این جلسه پیدا نشد.</div>
      </>
    );
  }

  const org = people[m.organizer];

  return (
    <>
      <div className="detail-top">
        <button className="back-btn" onClick={() => router.back()} aria-label="بازگشت"><IconBack size={18} /></button>
        <span className={'tag t-' + m.type}>{typeLabels[m.type]}</span>
        <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
      </div>

      <div className="detail-head">
        <div className="hrow"><h1>{m.title}</h1></div>
        <div className="meta-grid">
          <div className="meta-box">
            <small><IconClock size={13} />زمان</small>
            <b className="num">{dayNames[m.day]} · {fmtTime(m.start)} تا {fmtTime(m.end)}</b>
          </div>
          <div className="meta-box">
            <small>{m.type === 'online' ? <IconVideo size={13} /> : <IconMapPin size={13} />}مکان</small>
            <b>{rooms[m.room]?.name ?? '—'}</b>
          </div>
          <div className="meta-box">
            <small><IconUsers size={13} />برگزارکننده</small>
            <b>{org?.name}</b>
          </div>
        </div>
        {m.type === 'online' && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => store.toast('در حال باز کردن Google Meet…', 'ok')}>
            <IconVideo size={16} />پیوستن به جلسه
          </button>
        )}
      </div>

      <div className="detail-layout">
        {/* main: minutes — the focus */}
        <div className="d-main">
          <MinutesEditor meeting={m} />
        </div>

        {/* aside: details on demand */}
        <div className="d-aside">
          <div className={'gcard ' + (m.synced ? 'ok' : 'pending')} style={{ marginBottom: 14 }}>
            <span className="gi">{m.synced ? <IconGoogle size={22} /> : <IconGoogle size={22} />}</span>
            <div>
              <b>{m.synced ? 'همگام با Google Calendar' : 'همگام نشده'}</b>
              <small>{m.synced ? 'دعوت‌نامه‌ها ارسال شد' : 'در Google Calendar ثبت نشده'}</small>
            </div>
            {m.synced
              ? <span className="act">مشاهده ↗</span>
              : <button className="act" onClick={() => { store.syncMeeting(m.id); store.toast('جلسه با Google Calendar همگام شد', 'ok'); }}>همگام کن</button>}
          </div>

          <details className="disclosure" open>
            <summary>
              <span className="lead-ic"><IconList size={17} /></span>
              دستور جلسه
              <span className="cnt num">{toFa(m.agenda.length)} مورد</span>
              <span className="caret"><IconChevron size={16} /></span>
            </summary>
            <div className="dz">
              {m.agenda.length === 0
                ? <div className="empty" style={{ padding: 12 }}>دستور جلسه‌ای ثبت نشده.</div>
                : (
                  <ul className="agenda">
                    {m.agenda.map((a, i) => (
                      <li key={i}><span className="n num">{toFa(i + 1)}</span><span>{a.title}</span><span className="dur num">{toFa(a.dur)} دقیقه</span></li>
                    ))}
                  </ul>
                )}
            </div>
          </details>

          <details className="disclosure">
            <summary>
              <span className="lead-ic"><IconUsers size={17} /></span>
              شرکت‌کنندگان
              <span className="cnt num">{toFa(m.parts.length + m.guests.length)} نفر</span>
              <span className="caret"><IconChevron size={16} /></span>
            </summary>
            <div className="dz">
              <div className="parts">
                {m.parts.map((pid) => {
                  const p = people[pid];
                  return (
                    <div className="part" key={pid}>
                      <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>{initials(p.name)}</span>
                      <div><b>{p.name}</b><small>{p.role}</small></div>
                      <span className="role">{pid === m.organizer ? 'برگزارکننده' : 'شرکت‌کننده'}</span>
                    </div>
                  );
                })}
                {m.guests.map((gid) => {
                  const g = guests[gid];
                  return (
                    <div className="part ext" key={gid}>
                      <span className="ava sm" style={{ background: 'linear-gradient(145deg,var(--info),#153E7E)' }}>{initials(g.name)}</span>
                      <div><b>{g.name}</b><small>{g.org}</small></div>
                      <span className="role">مهمان</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
