'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { TODAY, NOW_HOUR, dayNames, fmtTime, toFa } from '@/lib/data';
import {
  IconBell, IconCalendar, IconClock, IconTask, IconReminder, IconUsers, IconX,
} from './Icons';

function human(mins: number): string {
  if (mins < 60) return `${toFa(mins)} دقیقه`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${toFa(h)} ساعت و ${toFa(m)} دقیقه` : `${toFa(h)} ساعت`;
}
const short = (t: string) => t.replace(/—.*/, '').trim();

type N = { id: string; kind: 'meeting' | 'invite' | 'reminder' | 'task'; title: string; sub: string; urgent?: boolean; mid: string };

export default function NotificationBell() {
  const store = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const notifs: N[] = [];
  store.visibleMeetings
    .filter((m) => m.day === TODAY && m.start >= NOW_HOUR && m.status !== 'cancelled')
    .sort((a, b) => a.start - b.start)
    .forEach((m) => {
      const mins = Math.round((m.start - NOW_HOUR) * 60);
      notifs.push({ id: 'm' + m.id, kind: 'meeting', title: m.title, sub: `شروع در ${human(mins)}`, urgent: mins <= 30, mid: m.id });
    });
  store.visibleMeetings.filter((m) => m.status === 'pending').forEach((m) => {
    notifs.push({ id: 'i' + m.id, kind: 'invite', title: `دعوت: ${short(m.title)}`, sub: `${dayNames[m.day]} · ${fmtTime(m.start)}`, mid: m.id });
  });
  store.visibleMeetings.forEach((m) => (store.minutes[m.id] ?? []).forEach((x) => {
    if (x.type === 'reminder') notifs.push({ id: x.id, kind: 'reminder', title: x.text, sub: x.when || dayNames[m.day], mid: m.id });
    if (x.type === 'task' && !x.done) notifs.push({ id: x.id, kind: 'task', title: x.text, sub: `مهلت: ${x.due || '—'}`, mid: m.id });
  }));

  const meta = {
    meeting: { color: 'var(--brand)', bg: 'var(--mint-soft)', Icon: IconCalendar },
    invite: { color: 'var(--warn)', bg: 'var(--warn-soft)', Icon: IconUsers },
    reminder: { color: 'var(--warn)', bg: 'var(--warn-soft)', Icon: IconReminder },
    task: { color: 'var(--info)', bg: 'var(--info-soft)', Icon: IconTask },
  } as const;

  const go = (mid: string) => { setOpen(false); router.push(`/meetings/${mid}`); };

  return (
    <>
      <button className="icon-btn" aria-label="اعلان‌ها" onClick={() => setOpen((v) => !v)}>
        {notifs.length > 0 && <span className="badge" />}
        <IconBell size={18} />
      </button>

      {open && <div className="notif-overlay" onClick={() => setOpen(false)} />}
      <div className={'notif-panel' + (open ? ' show' : '')}>
        <div className="notif-head">
          <div>
            <b>اعلان‌ها</b>
            <small>{toFa(notifs.length)} مورد فعال</small>
          </div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setOpen(false)} aria-label="بستن"><IconX size={16} /></button>
        </div>

        <button className={'sms-row' + (store.smsEnabled ? ' on' : '')} onClick={store.toggleSms}>
          <div><b>ارسال هم‌زمان پیامک</b><small>{store.smsEnabled ? 'متصل — اعلان‌ها پیامک می‌شوند' : 'اتصال به پنل پیامکی'}</small></div>
          <span className="switch"><span className="knob" /></span>
        </button>

        <div className="notif-list">
          {notifs.length === 0 ? (
            <div className="empty" style={{ padding: 26 }}>اعلان فعالی نیست.</div>
          ) : notifs.map((n) => {
            const mt = meta[n.kind];
            return (
              <button className={'notif' + (n.urgent ? ' urgent' : '')} key={n.id} onClick={() => go(n.mid)}>
                <span className="ni" style={{ background: mt.bg, color: mt.color }}><mt.Icon size={17} /></span>
                <div className="nc">
                  <div className="nt">{short(n.title)}</div>
                  <div className="ns">
                    <span><IconClock size={12} />{n.sub}</span>
                    {n.urgent && <span className="ntag urg">۳۰ دقیقه</span>}
                    {store.smsEnabled && <span className="ntag sms">پیامک</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="notif-foot">یادآور خودکار ۳۰ دقیقه قبل از هر جلسه، تسک و یادآور ارسال می‌شود.</div>
      </div>
    </>
  );
}
