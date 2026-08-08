'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MinutesEditor from '@/components/MinutesEditor';
import AgendaEditor from '@/components/AgendaEditor';
import EditMeetingModal from '@/components/EditMeetingModal';
import ReminderCard from '@/components/ReminderCard';
import CancelMeetingDialog from '@/components/CancelMeetingDialog';
import LocationDialog from '@/components/LocationDialog';
import { useReveal } from '@/components/useReveal';
import { statusLabels, fmtTime, initials, toFa, priorityLabels, priorityColor, faDate, faWeekdayOf, isUrl, meetPlatform, meetingColor } from '@/lib/data';
import {
  IconBack, IconClock, IconMapPin, IconUsers, IconList, IconChevron, IconVideo, IconEdit,
  IconX, IconEye, IconAlert,
} from '@/components/Icons';

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const { people, rooms, guests } = store;
  const m = store.getMeeting(id);
  const scope = useReveal(['.detail-top', '.detail-head', '.minutes', '.disclosure']);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

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
  const cat = store.categories[m.category];
  const catColor = meetingColor(store.categories, m);
  const room = m.room ? rooms[m.room] : undefined;

  return (
    <div ref={scope}>
      <div className="detail-top">
        <button className="back-btn" onClick={() => router.back()} aria-label="بازگشت"><IconBack size={18} /></button>
        {cat && (
          <span className="cat-chip" style={{ color: catColor, background: `color-mix(in srgb,${catColor} 14%,transparent)` }}>
            <i style={{ background: catColor }} />{cat.name}
          </span>
        )}
        <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
        <span className="prio-chip" style={{ color: priorityColor[m.priority ?? 'normal'], background: `color-mix(in srgb,${priorityColor[m.priority ?? 'normal']} 14%,transparent)` }}>
          اولویت {priorityLabels[m.priority ?? 'normal']}
        </span>
        {store.canEdit(m) && m.status !== 'cancelled' && (
          <>
            <button className="edit-btn" onClick={() => setEditOpen(true)} aria-label="ویرایش جلسه" title="ویرایش جلسه">
              <IconEdit size={17} />
            </button>
            <button className="edit-btn danger" onClick={() => setCancelOpen(true)}
              aria-label="لغو جلسه" title="لغو جلسه"><IconX size={17} /></button>
          </>
        )}
      </div>

      {m.status === 'cancelled' && (
        <div className="cancel-banner">
          <span className="cb-ic"><IconAlert size={17} /></span>
          <div>
            <b>این جلسه لغو شده است.</b>
            {m.cancelReason
              ? <p>{m.cancelReason}</p>
              : <p>دلیلی ثبت نشده است.</p>}
          </div>
        </div>
      )}

      <div className="detail-head">
        <div className="hrow"><h1>{m.title}</h1></div>
        <div className="meta-grid">
          <div className="meta-box">
            <small><IconClock size={13} />زمان</small>
            <b className="num">{faDate(m.date)} · {fmtTime(m.start)} تا {fmtTime(m.end)}</b>
          </div>
          <div className="meta-box">
            <small>{m.type === 'online' ? <IconVideo size={13} /> : <IconMapPin size={13} />}مکان</small>
            <b className="mb-loc">
              {/* در RTL اولین فرزند سمت راست می‌نشیند: نام محل راست، «مشاهده» چپِ آن */}
              <span className="mb-name">{m.type === 'online' ? 'جلسهٔ آنلاین' : (room?.name ?? '—')}</span>
              {m.type !== 'online' && room && (
                <button className="loc-view" onClick={() => setLocOpen(true)}>
                  <IconEye size={13} />مشاهده
                </button>
              )}
            </b>
          </div>
          <div className="meta-box">
            <small><IconUsers size={13} />برگزارکننده</small>
            <b>{org?.name}</b>
          </div>
        </div>
        {m.type === 'online' && (m.meetLink ? (
          <>
            {/* هر سازمانی سرویس خودش را دارد — لینک همان‌طور که ثبت شده باز می‌شود */}
            {isUrl(m.meetLink) ? (
              <a className="btn btn-primary btn-block" style={{ marginTop: 12 }}
                href={m.meetLink} target="_blank" rel="noopener noreferrer">
                <IconVideo size={16} />
                پیوستن به جلسه{meetPlatform(m.meetLink) ? ` در ${meetPlatform(m.meetLink)}` : ''}
              </a>
            ) : (
              <div className="meet-note" style={{ marginTop: 12 }}>
                <IconVideo size={14} />شناسهٔ اتاق جلسه — در سرویس سازمان وارد کنید.
              </div>
            )}
            <div className="meet-link" dir="ltr">{m.meetLink}</div>
          </>
        ) : (
          <div className="meet-link" style={{ marginTop: 12 }}>لینک جلسهٔ آنلاین ثبت نشده است.</div>
        ))}
      </div>

      <div className="detail-layout">
        {/* main: minutes — the focus */}
        <div className="d-main">
          <MinutesEditor meeting={m} />
        </div>

        {/* aside: details on demand */}
        <div className="d-aside">
          <ReminderCard meetingId={m.id} />
          <details className="disclosure" open>
            <summary>
              <span className="lead-ic"><IconList size={17} /></span>
              دستور جلسه
              <span className="cnt num">{toFa(m.agenda.length)} مورد</span>
              <span className="caret"><IconChevron size={16} /></span>
            </summary>
            <AgendaEditor meeting={m} />
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
                  if (!p) return null;
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
                  if (!g) return null;
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

      {cancelOpen && <CancelMeetingDialog meeting={m} onClose={() => setCancelOpen(false)} />}
      {locOpen && room && <LocationDialog room={room} onClose={() => setLocOpen(false)} />}
      <EditMeetingModal meeting={m} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
