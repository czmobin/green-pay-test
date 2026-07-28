'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MinutesEditor from '@/components/MinutesEditor';
import AgendaEditor from '@/components/AgendaEditor';
import EditMeetingModal from '@/components/EditMeetingModal';
import { useReveal } from '@/components/useReveal';
import { typeLabels, statusLabels, fmtTime, initials, toFa, priorityLabels, priorityColor, faDate } from '@/lib/data';
import {
  IconBack, IconClock, IconMapPin, IconUsers, IconList, IconChevron, IconVideo, IconEdit,
} from '@/components/Icons';

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const { people, rooms, guests } = store;
  const m = store.getMeeting(id);
  const scope = useReveal(['.detail-top', '.detail-head', '.minutes', '.disclosure']);
  const [editOpen, setEditOpen] = useState(false);

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
    <div ref={scope}>
      <div className="detail-top">
        <button className="back-btn" onClick={() => router.back()} aria-label="بازگشت"><IconBack size={18} /></button>
        <span className={'tag t-' + m.type}>{typeLabels[m.type]}</span>
        <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
        <span className="prio-chip" style={{ color: priorityColor[m.priority ?? 'normal'], background: `color-mix(in srgb,${priorityColor[m.priority ?? 'normal']} 14%,transparent)` }}>
          اولویت {priorityLabels[m.priority ?? 'normal']}
        </span>
        {store.canEdit(m) && (
          <button className="edit-btn" onClick={() => setEditOpen(true)} aria-label="ویرایش جلسه" title="ویرایش جلسه">
            <IconEdit size={17} />
          </button>
        )}
      </div>

      <div className="detail-head">
        <div className="hrow"><h1>{m.title}</h1></div>
        <div className="meta-grid">
          <div className="meta-box">
            <small><IconClock size={13} />زمان</small>
            <b className="num">{faDate(m.date)} · {fmtTime(m.start)} تا {fmtTime(m.end)}</b>
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
        {m.type === 'online' && (m.meetLink ? (
          <>
            <a className="btn btn-primary btn-block" style={{ marginTop: 12 }}
              href={m.meetLink} target="_blank" rel="noopener noreferrer">
              <IconVideo size={16} />پیوستن به جلسهٔ آنلاین
            </a>
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

      <EditMeetingModal meeting={m} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
