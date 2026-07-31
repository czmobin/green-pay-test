'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store';
import { useReveal } from '@/components/useReveal';
import { api, type FullReport } from '@/lib/api';
import { toFa, faDate, initials } from '@/lib/data';
import {
  IconAlert, IconCheck, IconChevron, IconClock, IconDoc, IconList,
  IconReminder, IconReport, IconTask, IconUsers,
} from '@/components/Icons';

type Tab = 'alerts' | 'meetings' | 'people' | 'cats';

const RANGES: [number, string][] = [[30, '۳۰ روز'], [90, '۹۰ روز'], [180, '۶ ماه']];

const levelLabel: Record<string, string> = { high: 'بحرانی', mid: 'قابل‌توجه', low: 'برای اطلاع' };

/** نوار درصد — سبز بالای ۷۰، کهربایی ۴۰ تا ۷۰، قرمز زیر ۴۰ */
function Rate({ value }: { value: number }) {
  const color = value >= 70 ? 'var(--brand)' : value >= 40 ? 'var(--warn)' : 'var(--danger)';
  return (
    <span className="rate">
      <span className="rate-bar"><i style={{ width: `${Math.min(value, 100)}%`, background: color }} /></span>
      <b className="num" style={{ color }}>{toFa(value)}٪</b>
    </span>
  );
}

export default function ReportsPage() {
  const store = useStore();
  const router = useRouter();
  const [days, setDays] = useState(90);
  const [tab, setTab] = useState<Tab>('alerts');
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

  const scope = useReveal(['.page-head', '.filters', '.rep-kpi', '.alert-card', '.rep-card']);
  const go = (id: string) => router.push(`/meetings/${id}`);

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
          این گزارش جلسه نمی‌شمارد؛ نشان می‌دهد کجای فرایند می‌لنگد — جلسه‌ای که صورت‌جلسه ندارد،
          جلسه‌ای که هیچ اقدامی از دلش بیرون نیامده، و تسکی که از مهلتش گذشته.
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
        <>
          <div className="rep-kpis">
            <div className="rep-kpi"><span className="rk-lbl">جلسهٔ برگزارشده</span>
              <b className="num">{toFa(t.past)}</b><small>از {toFa(t.meetings)} جلسهٔ این بازه</small></div>
            <div className="rep-kpi"><span className="rk-lbl">ساعت صرف‌شده</span>
              <b className="num">{toFa(t.hours)}</b><small>میانگین هر جلسه {toFa(t.avgLength)} ساعت</small></div>
            <div className="rep-kpi"><span className="rk-lbl">نرخ صورت‌جلسه</span>
              <b className="num">{toFa(t.minuteRate)}٪</b><small>جلسه‌هایی که چیزی برایشان ثبت شده</small></div>
            <div className="rep-kpi"><span className="rk-lbl">نرخ خروجی عملی</span>
              <b className="num">{toFa(t.actionRate)}٪</b><small>جلسه‌هایی که تسک/یادآور/تماس داده‌اند</small></div>
            <div className={'rep-kpi' + (t.tasksOverdue ? ' bad' : '')}><span className="rk-lbl">تسک عقب‌افتاده</span>
              <b className="num">{toFa(t.tasksOverdue)}</b><small>از {toFa(t.tasks)} تسک ثبت‌شده</small></div>
            <div className={'rep-kpi' + (t.wastedHours > t.hours / 2 ? ' bad' : '')}><span className="rk-lbl">ساعت بی‌خروجی</span>
              <b className="num">{toFa(t.wastedHours)}</b><small>ساعتی که هیچ اقدامی از آن درنیامده</small></div>
          </div>

          <div className="filters">
            {([['alerts', `هشدارها (${toFa(data.alerts.length)})`], ['meetings', 'جلسه‌های مشکل‌دار'],
               ['people', 'افراد'], ['cats', 'دسته‌بندی‌ها']] as [Tab, string][]).map(([id, lbl]) => (
              <button key={id} className={'chip-btn' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{lbl}</button>
            ))}
          </div>

          {/* ---------------- هشدارها ---------------- */}
          {tab === 'alerts' && (
            data.alerts.length === 0 ? (
              <div className="result-empty"><div><IconCheck size={40} /></div>
                هیچ هشداری نیست — همهٔ جلسه‌ها صورت‌جلسه و اقدام دارند.</div>
            ) : (
              <div className="alert-list">
                {data.alerts.map((a) => (
                  <div className={`alert-card lv-${a.level}`} key={a.kind}>
                    <span className="ac-ic"><IconAlert size={17} /></span>
                    <div className="ac-body">
                      <div className="ac-top">
                        <b>{a.title}</b>
                        <span className="ac-lvl">{levelLabel[a.level]}</span>
                        <span className="ac-n num">{toFa(a.count)}</span>
                      </div>
                      <p className="ac-detail">{a.detail}</p>
                      <p className="ac-hint">{a.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ---------------- جلسه‌های مشکل‌دار ---------------- */}
          {tab === 'meetings' && (
            <div className="rep-cols">
              <section className="card rep-card">
                <div className="card-head"><h3><IconDoc size={17} /> بدون صورت‌جلسه</h3>
                  <span className="cnt num">{toFa(data.deadMeetings.length)}</span></div>
                <p className="rep-note">برگزار شده‌اند و هیچ آیتمی برایشان ثبت نشده — معلوم نیست چه گذشته.</p>
                {data.deadMeetings.length === 0 ? <div className="rep-empty">موردی نیست.</div> : (
                  <ul className="rep-list">
                    {data.deadMeetings.map((m) => (
                      <li key={m.id} onClick={() => go(m.id)}>
                        <span className="rl-dot" style={{ background: m.categoryColor }} />
                        <div><b>{m.title}</b>
                          <small>{faDate(m.date)} · {m.organizerName} · {toFa(m.people)} نفر · {toFa(m.hours)} ساعت</small></div>
                        <IconChevron size={16} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card rep-card">
                <div className="card-head"><h3><IconList size={17} /> بدون خروجی عملی</h3>
                  <span className="cnt num">{toFa(data.noActionMeetings.length)}</span></div>
                <p className="rep-note">صورت‌جلسه دارند ولی هیچ تسک، یادآور یا تماسی از آن‌ها بیرون نیامده.</p>
                {data.noActionMeetings.length === 0 ? <div className="rep-empty">موردی نیست.</div> : (
                  <ul className="rep-list">
                    {data.noActionMeetings.map((m) => (
                      <li key={m.id} onClick={() => go(m.id)}>
                        <span className="rl-dot" style={{ background: m.categoryColor }} />
                        <div><b>{m.title}</b>
                          <small>{faDate(m.date)} · {toFa(m.entries ?? 0)} یادداشت · {toFa(m.hours)} ساعت</small></div>
                        <IconChevron size={16} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card rep-card">
                <div className="card-head"><h3><IconTask size={17} /> تسک‌های عقب‌افتاده</h3>
                  <span className="cnt num">{toFa(data.overdueTasks.length)}</span></div>
                <p className="rep-note">مهلتشان گذشته و هنوز بسته نشده‌اند — دیرترین‌ها بالا.</p>
                {data.overdueTasks.length === 0 ? <div className="rep-empty">موردی نیست.</div> : (
                  <ul className="rep-list">
                    {data.overdueTasks.map((x) => (
                      <li key={x.id} onClick={() => go(x.meeting)}>
                        <span className="rl-late num">{toFa(x.daysLate)} روز</span>
                        <div><b>{x.text}</b><small>{x.assigneeName} · {x.meetingTitle}</small></div>
                        <IconChevron size={16} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card rep-card">
                <div className="card-head"><h3><IconReminder size={17} /> یادآورهای رهاشده</h3>
                  <span className="cnt num">{toFa(data.staleReminders.length)}</span></div>
                <p className="rep-note">زمانشان گذشته و هیچ‌وقت بسته نشده‌اند.</p>
                {data.staleReminders.length === 0 ? <div className="rep-empty">موردی نیست.</div> : (
                  <ul className="rep-list">
                    {data.staleReminders.map((x) => (
                      <li key={x.id} onClick={() => go(x.meeting)}>
                        <span className="rl-dot" style={{ background: 'var(--warn)' }} />
                        <div><b>{x.text}</b><small>{x.when} · {x.meetingTitle}</small></div>
                        <IconChevron size={16} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card rep-card">
                <div className="card-head"><h3><IconUsers size={17} /> دعوت‌های بی‌پاسخ</h3>
                  <span className="cnt num">{toFa(data.unanswered.length)}</span></div>
                <p className="rep-note">تا زمان برگزاری جلسه پاسخی داده نشده — حضور قابل برنامه‌ریزی نبوده.</p>
                {data.unanswered.length === 0 ? <div className="rep-empty">موردی نیست.</div> : (
                  <ul className="rep-list">
                    {data.unanswered.map((x, i) => (
                      <li key={x.meeting + x.user + i} onClick={() => go(x.meeting)}>
                        <span className="rl-dot" style={{ background: 'var(--muted)' }} />
                        <div><b>{x.userName}</b><small>{faDate(x.date)} · {x.meetingTitle}</small></div>
                        <IconChevron size={16} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ---------------- افراد ---------------- */}
          {tab === 'people' && (
            <>
              {data.silentOrganizers.length > 0 && (
                <div className="alert-card lv-mid rep-card">
                  <span className="ac-ic"><IconAlert size={17} /></span>
                  <div className="ac-body">
                    <div className="ac-top"><b>صورت‌جلسه نمی‌نویسند</b>
                      <span className="ac-n num">{toFa(data.silentOrganizers.length)}</span></div>
                    <p className="ac-detail">
                      {data.silentOrganizers.map((p) => p.name).join('، ')} — برای کمتر از ۶۰٪ جلسه‌هایی که
                      خودشان گرفته‌اند چیزی ثبت کرده‌اند.
                    </p>
                  </div>
                </div>
              )}

              <div className="card rep-card rep-table-card">
                <div className="card-head"><h3><IconUsers size={17} /> بار جلسات و پیگیری</h3></div>
                <div className="rep-scroll">
                  <table className="rep-table">
                    <thead>
                      <tr>
                        <th>فرد</th><th>جلسه</th><th>ساعت</th>
                        <th>نرخ صورت‌جلسه</th><th>تسک باز</th><th>عقب‌افتاده</th><th>نرخ انجام</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className="tp-person">
                              <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color || 'var(--brand),var(--brand-deep)'})` }}>
                                {initials(p.name)}
                              </span>
                              <span><b>{p.name}</b>{p.role && <small>{p.role}</small>}</span>
                            </span>
                          </td>
                          <td className="num">{toFa(p.meetings)}</td>
                          <td className="num">{toFa(p.hours)}</td>
                          <td>{p.organizedPast ? <Rate value={p.minuteRate} /> : <span className="dash">—</span>}</td>
                          <td className="num">{toFa(p.tasksOpen)}</td>
                          <td className={'num' + (p.tasksOverdue ? ' bad' : '')}>{toFa(p.tasksOverdue)}</td>
                          <td>{p.tasksOpen + p.tasksDone ? <Rate value={p.taskDoneRate} /> : <span className="dash">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ---------------- دسته‌بندی‌ها ---------------- */}
          {tab === 'cats' && (
            <div className="card rep-card rep-table-card">
              <div className="card-head"><h3><IconClock size={17} /> بازدهی هر دسته</h3></div>
              <p className="rep-note">
                «نرخ خروجی» یعنی چند درصد از جلسه‌های برگزارشدهٔ آن دسته حداقل یک تسک، یادآور یا تماس تولید کرده‌اند.
              </p>
              <div className="rep-scroll">
                <table className="rep-table">
                  <thead>
                    <tr><th>دسته</th><th>جلسه</th><th>ساعت</th><th>تسک</th><th>نرخ خروجی</th></tr>
                  </thead>
                  <tbody>
                    {data.categories.map((c) => (
                      <tr key={c.id}>
                        <td><span className="tp-person"><span className="rl-dot" style={{ background: c.color }} /><b>{c.name}</b></span></td>
                        <td className="num">{toFa(c.meetings)}</td>
                        <td className="num">{toFa(c.hours)}</td>
                        <td className="num">{toFa(c.tasks)}</td>
                        <td>{c.past ? <Rate value={c.actionRate} /> : <span className="dash">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
