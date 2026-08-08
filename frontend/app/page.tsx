'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import MeetingRow from '@/components/MeetingRow';
import HeroCanvas from '@/components/HeroCanvas';
import { useReveal, useCountUp } from '@/components/useReveal';
import { fmtTime, toFa, todayISO, nowHour, faDate, faDateLabel, addDaysISO, isUrl } from '@/lib/data';
import {
  IconCalendar, IconClock, IconGuests, IconMapPin, IconVideo, IconCheck, IconX, IconSearch, IconPlus,
} from '@/components/Icons';

export default function Dashboard() {
  const store = useStore();
  const router = useRouter();
  const rooms = store.rooms;
  const vis = store.visibleMeetings;
  const meName = (store.people[store.currentUser]?.name ?? 'کاربر').split(' ')[0];
  const iso = todayISO();
  const hour = nowHour();
  const today = vis.filter((m) => m.date === iso).sort((a, b) => a.start - b.start);
  /**
   * «جلسهٔ بعدی» نزدیک‌ترین جلسهٔ پیشِ روست — لزوماً امروز نیست، و جلسه‌ای که
   * تاریخ یا ساعتش گذشته دیگر نشان داده نمی‌شود.
   */
  const next = vis
    .filter((m) => m.date > iso || (m.date === iso && m.end > hour))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  const pending = vis.filter((m) => m.status === 'pending').length;
  const tomorrowCount = vis.filter((m) => m.date === addDaysISO(iso, 1)).length;
  const invites = vis.filter((m) => m.status === 'pending').sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  const [q, setQ] = useState('');

  const scope = useReveal(['.page-head', '.next-card', '.kpi', '.section-title', '.invite', '.mrow']);
  useCountUp(scope);

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>سلام، {meName} 👋</h1>
        <p>{faDate(iso, true)} — امروز {toFa(today.length)} جلسه دارید.</p>
      </div>

      {/* جستجوی سریع — نتیجه در تب جلسات باز می‌شود */}
      <form className="quick-search" onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (!term) { store.toast('عبارتی برای جستجو بنویسید', 'info'); return; }
        router.push(`/meetings?q=${encodeURIComponent(term)}`);
      }}>
        <IconSearch size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی سریع در عنوان و صورت‌جلسه…" aria-label="جستجوی سریع جلسات" />
        {q && <button type="button" className="clr" onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={15} /></button>}
        <button className="btn btn-primary qs-go" type="submit">جستجو</button>
      </form>

      {next && (
        <div className="next-card" onClick={() => router.push(`/meetings/${next.id}`)} role="button" style={{ cursor: 'pointer' }}>
          <HeroCanvas />
          <span className="glow" />
          <div className="eyebrow"><span className="live" />جلسهٔ بعدی شما</div>
          <h2>{next.title}</h2>
          <div className="nm-meta">
            {/* جلسهٔ بعدی لزوماً امروز نیست، پس روزش هم باید معلوم باشد */}
            <span><IconCalendar size={14} />{faDateLabel(next.date)}</span>
            <span><IconClock size={14} /><span className="num">{fmtTime(next.start)} – {fmtTime(next.end)}</span></span>
            <span>{next.type === 'online' ? <IconVideo size={14} /> : <IconMapPin size={14} />}{next.type === 'online' ? 'جلسهٔ آنلاین' : (rooms[next.room]?.name ?? '—')}</span>
            {next.guests.length > 0 && <span><IconGuests size={14} />{toFa(next.guests.length)} مهمان خارجی</span>}
          </div>
          <div className="nm-actions">
            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); router.push(`/meetings/${next.id}`); }}>
              باز کردن و نوشتن صورت‌جلسه
            </button>
            {next.type === 'online' && (
              <button className="btn btn-join" onClick={(e) => {
                e.stopPropagation();
                store.toast('در حال رفتن به جلسهٔ آنلاین…', 'ok');
                if (isUrl(next.meetLink)) window.open(next.meetLink, '_blank', 'noopener');
                else router.push(`/meetings/${next.id}`);
              }}>
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
          <div className="val num"><span data-count={today.length}>{toFa(today.length)}</span> <small>جلسه</small></div>
        </div>
        <button className="kpi" onClick={() => router.push(`/meetings?day=${addDaysISO(iso, 1)}`)}>
          <div className="ic" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><IconCalendar size={18} /></div>
          <div className="lbl">جلسات فردا</div>
          <div className="val num"><span data-count={tomorrowCount}>{toFa(tomorrowCount)}</span> <small>جلسه</small></div>
        </button>
        <button className="kpi" onClick={() => router.push('/meetings?status=pending')}>
          <div className="ic" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><IconClock size={18} /></div>
          <div className="lbl">در انتظار تأیید</div>
          <div className="val num"><span data-count={pending}>{toFa(pending)}</span> <small>دعوت</small></div>
        </button>
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
                    <span className="num"><IconClock size={12} />{faDateLabel(m.date)} · {fmtTime(m.start)}</span>
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
        <Link href="/calendar?view=week">تقویم هفته</Link>
      </div>
      {today.length === 0 ? (
        <div className="empty-banner">
          <span className="eb-ic"><IconCalendar size={26} /></span>
          <div>
            <b>امروز جلسه‌ای ندارید</b>
            <p>
              {next
                ? <>نزدیک‌ترین جلسه‌تان {faDateLabel(next.date)} ساعت <span className="num">{fmtTime(next.start)}</span> است.</>
                : 'جلسه‌ای در پیشِ رو ثبت نشده — از دکمهٔ «جلسهٔ جدید» می‌توانید یکی بسازید.'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={store.openCreate}>
            <IconPlus size={16} />جلسهٔ جدید
          </button>
        </div>
      ) : (
        <div className="mlist">
          {today.map((m) => <MeetingRow key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}
