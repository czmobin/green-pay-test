'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@/lib/types';
import { meetingColor, statusLabels, fmtTime, toFa, faDateLabel, faDateShort, daysUntil, priorityLabels, priorityColor } from '@/lib/data';
import { useStore } from './store';
import { IconMapPin, IconChevron, IconVideo, IconReminder } from './Icons';

export default function MeetingRow({ m, showDate = false }: { m: Meeting; showDate?: boolean }) {
  const router = useRouter();
  const store = useStore();
  const { rooms, categories, minutes } = store;
  const color = meetingColor(categories, m);
  const cat = categories[m.category];
  // «۳ روز مانده» گویاتر از فهرست آواتارهاست؛ همان جای شرکت‌کننده‌ها می‌نشیند
  const days = daysUntil(m.date);
  const rel = days === 0 ? 'امروز'
    : days === 1 ? 'فردا'
      : days === -1 ? 'دیروز'
        : days > 0 ? `${toFa(days)} روز مانده` : `${toFa(-days)} روز پیش`;

  /**
   * یادآور این جلسه؛ دو منبع دارد و هر دو باید روی کارت دیده شوند:
   *  ۱. یادآوری که در صورت‌جلسه نوشته شده،
   *  ۲. یادآور پیامکیِ خودِ کاربر که موقع ساخت جلسه تنظیم شده — پیش‌تر فقط
   *     مورد اول دیده می‌شد و جلسه‌ای که فقط یادآور پیامکی داشت، بی‌نشان بود.
   */
  const noteRemind = (minutes[m.id] ?? [])
    .filter((x) => x.type === 'reminder' && !x.done && x.remindDate)
    .sort((a, b) => (a.remindDate! + String(a.remindHour ?? 0)).localeCompare(b.remindDate! + String(b.remindHour ?? 0)))[0];
  const sms = store.reminders[m.id];
  const remind = noteRemind
    ? { hour: noteRemind.remindHour, date: noteRemind.remindDate!, sms: false }
    : sms ? { hour: sms.hour, date: sms.date, sms: true } : null;

  // دعوت بی‌پاسخ خودِ کاربر — مهم‌تر از وضعیت کلی جلسه است
  const waiting = store.myResponse(m) === 'pending';

  return (
    <button className="mrow" onClick={() => router.push(`/meetings/${m.id}`)}>
      <span className="bar" style={{ background: color }} />
      {/* ستون راست: ساعت بالا، نشان آنلاین وسط، یادآور پایین */}
      <span className="time">
        <span className="tt">
          <b className="num">{fmtTime(m.start)}</b>
          <small className="num">{fmtTime(m.end)}</small>
        </span>
        {m.type === 'online' && (
          <span className="t-badge online" title="جلسهٔ آنلاین"><IconVideo size={12} /></span>
        )}
        {remind && (
          <span className="t-badge remind"
            title={`${remind.sms ? 'یادآور پیامکی' : 'یادآور'}: ${faDateShort(remind.date)}`}>
            <IconReminder size={12} />
            <em className="num">{remind.hour != null ? fmtTime(remind.hour) : faDateShort(remind.date)}</em>
          </span>
        )}
      </span>
      <span className="body">
        <span className="t">{m.title}</span>
        {/* سطر محل: تنها چیزی که کنارش می‌آید تاریخ است */}
        <span className="meta">
          {showDate && <span className="num">{faDateLabel(m.date)}</span>}
          <span><IconMapPin size={12} />{m.type === 'online' ? 'جلسهٔ آنلاین' : (rooms[m.room]?.name ?? '—')}</span>
        </span>
        {/* تگ‌ها همیشه در سطر جدا، تا سطر محل شلوغ نشود */}
        <span className="chips">
          {cat && (
            <span className="cat-chip" style={{ color, background: `color-mix(in srgb,${color} 14%,transparent)` }}>
              <i style={{ background: color }} />{cat.name}
            </span>
          )}
          <span className="prio-chip" style={{ color: priorityColor[m.priority ?? 'normal'], background: `color-mix(in srgb,${priorityColor[m.priority ?? 'normal']} 14%,transparent)` }}>
            اولویت {priorityLabels[m.priority ?? 'normal']}
          </span>
        </span>
      </span>
      {/* ستون چپ: وضعیتِ نیازمند توجه بالا، روزهای مانده پایین */}
      <span className="side">
        {/* تگ «تأییدشده» حذف شد — حالت عادی است و ارزش فضا ندارد */}
        {waiting
          ? <span className="pill p-pending">در انتظار تأیید</span>
          : m.status !== 'confirmed' && (
            <span className={'pill p-' + m.status}>{statusLabels[m.status]}</span>
          )}
        <span className={'rel-days' + (days < 0 ? ' past' : days <= 1 ? ' soon' : '')}>{rel}</span>
      </span>
      <span className="chev"><IconChevron size={18} /></span>
    </button>
  );
}
