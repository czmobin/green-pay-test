'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { api, type FullReport } from '@/lib/api';
import { toFa, faDate } from '@/lib/data';
import { IconReport } from '@/components/Icons';

const RANGES: [number, string][] = [[30, '۳۰ روز'], [90, '۹۰ روز'], [180, '۶ ماه']];

export default function ReportsPage() {
  const store = useStore();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<FullReport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (d: number) => {
    setBusy(true); setErr('');
    try {
      setData(await api.report(d));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'گزارش خوانده نشد');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (store.isManager) load(days); }, [days, load, store.isManager]);

  const scope = useReveal(['.page-head', '.filters', '.rep-kpi']);

  if (!store.isManager) {
    return (
      <div className="result-empty"><div><IconReport size={40} /></div>
        گزارش کامل فقط برای مدیرعامل و ادمین در دسترس است.
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div ref={scope}>
      <div className="page-head">
        <h1>گزارش کامل</h1>
        <p>
          نگاه کلی به جلسات این بازه: چقدر وقت صرف شده، چند جلسه صورت‌جلسه دارد، و از دلِ
          چند جلسه یادآوری بیرون آمده.
        </p>
      </div>

      <div className="filters">
        {RANGES.map(([d, lbl]) => (
          <button key={d} className={'chip-btn' + (days === d ? ' active' : '')} onClick={() => setDays(d)}>{lbl}</button>
        ))}
        {data && <span className="rep-range num">{faDate(data.from)} تا {faDate(data.to)}</span>}
      </div>

      {busy && <div className="boot"><span className="boot-spin" />در حال محاسبهٔ گزارش…</div>}
      {err && !busy && <div className="boot boot-err"><b>گزارش خوانده نشد</b><span>{err}</span>
        <button className="btn btn-primary" onClick={() => load(days)}>تلاش دوباره</button></div>}

      {data && t && !busy && (
        <div className="rep-kpis">
          <div className="rep-kpi"><span className="rk-lbl">جلسهٔ برگزارشده</span>
            <b className="num">{toFa(t.past)}</b><small>از {toFa(t.meetings)} جلسهٔ این بازه</small></div>
          <div className="rep-kpi"><span className="rk-lbl">ساعت صرف‌شده</span>
            <b className="num">{toFa(t.hours)}</b><small>میانگین هر جلسه {toFa(t.avgLength)} ساعت</small></div>
          <div className="rep-kpi"><span className="rk-lbl">نرخ صورت‌جلسه</span>
            <b className="num">{toFa(t.minuteRate)}٪</b><small>جلسه‌هایی که صورت‌جلسه‌ای برایشان ثبت شده</small></div>
          <div className="rep-kpi"><span className="rk-lbl">نرخ خروجی عملی</span>
            <b className="num">{toFa(t.actionRate)}٪</b><small>جلسه‌هایی که یادآور داشته‌اند</small></div>
          <div className={'rep-kpi' + (t.wastedHours > t.hours / 2 ? ' bad' : '')}><span className="rk-lbl">ساعت بی‌خروجی</span>
            <b className="num">{toFa(t.wastedHours)}</b><small>ساعاتی که هیچ اقدامی برایشان ثبت نشده است</small></div>
          <div className="rep-kpi"><span className="rk-lbl">میانگین آیتم صورت‌جلسه</span>
            <b className="num">{toFa(t.entriesPerMeeting)}</b><small>آیتم برای هر جلسهٔ برگزارشده</small></div>
        </div>
      )}
    </div>
  );
}
