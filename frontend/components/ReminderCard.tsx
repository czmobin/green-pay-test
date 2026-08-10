'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from './store';
import { api, type MeetingReminder } from '@/lib/api';
import { toFa, fmtTime, faDate } from '@/lib/data';
import { IconReminder, IconCheck, IconClock, IconChevron } from './Icons';

/** «۹۰ دقیقه» → «۱ ساعت و ۳۰ دقیقه» */
function leadLabel(min: number): string {
  if (min < 60) return `${toFa(min)} دقیقه`;
  if (min % 1440 === 0) return `${toFa(min / 1440)} روز`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${toFa(h)} ساعت و ${toFa(m)} دقیقه` : `${toFa(h)} ساعت`;
}

/**
 * یادآور پیامکی جلسه — تنظیمِ همین کاربر برای همین جلسه.
 * هر کس فاصلهٔ خودش را دارد؛ تغییرِ یک نفر روی بقیه اثری ندارد.
 */
export default function ReminderCard({ meetingId }: { meetingId: string }) {
  const store = useStore();
  const [data, setData] = useState<MeetingReminder | null>(null);
  const [custom, setCustom] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.getReminder(meetingId)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : 'خوانده نشد'); });
    return () => { alive = false; };
  }, [meetingId]);

  const save = useCallback(async (body: { leadMinutes?: number; enabled?: boolean }) => {
    setBusy(true);
    try {
      const d = await api.setReminder(meetingId, body);
      setData(d);
      store.toast(
        body.enabled === false ? 'یادآور این جلسه خاموش شد'
          : body.enabled === true ? 'یادآور این جلسه روشن شد'
            : `یادآور روی ${leadLabel(d.leadMinutes)} پیش از جلسه تنظیم شد`, 'ok');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'ذخیره نشد', 'info');
    } finally {
      setBusy(false);
    }
  }, [meetingId, store]);

  if (err || !data || !data.applies) {
    // جلسه‌ای که کاربر در آن نیست یا شماره‌ای ثبت نشده — کارت بی‌معنی است
    if (data && !data.hasPhone) {
      return (
        <section className="card rem-card">
          <div className="card-head"><h3><IconReminder size={17} /> یادآور پیامکی</h3></div>
          <p className="rc-note">برای دریافت یادآور، شمارهٔ موبایل باید در حساب شما ثبت باشد.</p>
        </section>
      );
    }
    return null;
  }

  const sent = data.sentAt != null;

  return (
    <section className={'card rem-card' + (open ? ' open' : '')}>
      {/* جمع‌شده باز می‌شود تا صفحهٔ جلسه با جزئیات یادآور شلوغ نشود؛
          خلاصهٔ وضعیت روی خودِ سرصفحه دیده می‌شود. */}
      <button className="rc-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <h3><IconReminder size={17} /> یادآور پیامکی</h3>
        <span className="rc-sum">
          {!data.enabled ? 'خاموش'
            : sent ? 'فرستاده شد'
              : `${leadLabel(data.leadMinutes)} قبل`}
        </span>
        <span className="rc-caret"><IconChevron size={16} /></span>
      </button>

      {open && (
      <div className="rc-body">
      <div className="rc-toggle">
        <span>یادآور این جلسه</span>
        <button className={'rc-switch' + (data.enabled ? ' on' : '')} disabled={busy}
          onClick={() => save({ enabled: !data.enabled })}
          aria-label={data.enabled ? 'خاموش کردن یادآور' : 'روشن کردن یادآور'}>
          <span className="knob" />
        </button>
      </div>

      {data.enabled ? (
        <>
          <p className="rc-note">
            {sent ? (
              <><IconCheck size={13} /> پیامک یادآور برای شما فرستاده شد.
                {data.delivery && (
                  <span className={'rc-dlv' + (data.delivered ? ' ok' : ' warn')}>{data.delivery}</span>
                )}
                {data.msgId && <span className="rc-msgid num">شناسهٔ پیام: {data.msgId}</span>}</>
            ) : (
              <><IconClock size={13} /> پیامک {leadLabel(data.leadMinutes)} پیش از جلسه
                — {faDate(data.sendDate)}، ساعت <b className="num">{fmtTime(data.sendHour)}</b></>
            )}
          </p>

          <div className="rc-picks">
            {data.choices.map((c) => (
              <button key={c} className={'chip-btn' + (c === data.leadMinutes ? ' active' : '')}
                disabled={busy} onClick={() => save({ leadMinutes: c })}>
                {leadLabel(c)}
              </button>
            ))}
          </div>

          <form className="rc-custom" onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom);
            if (!n || n < 1 || n > 10080) { store.toast('عددی بین ۱ دقیقه تا ۷ روز بنویسید', 'info'); return; }
            void save({ leadMinutes: n }); setCustom('');
          }}>
            <input className="field-in num" inputMode="numeric" value={custom} placeholder="دلخواه"
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} aria-label="فاصله به دقیقه" />
            <span>دقیقه پیش از جلسه</span>
            <button className="btn btn-ghost" type="submit" disabled={busy || !custom}>تنظیم</button>
          </form>
        </>
      ) : (
        <p className="rc-note">یادآور این جلسه برای شما خاموش است — پیامکی فرستاده نمی‌شود.</p>
      )}

      {data.error && <p className="rc-err">آخرین تلاش ارسال ناموفق بود: {data.error}</p>}
      </div>
      )}
    </section>
  );
}
