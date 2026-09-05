'use client';
import React, { useMemo, useState } from 'react';
import { useStore } from './store';
import { initials, toFa } from '@/lib/data';
import { IconPlus, IconTrash, IconShare, IconEye, IconEdit } from './Icons';

/**
 * مدیریت اشتراک تقویم — دو فهرست جدا، چون دو رابطهٔ متفاوت‌اند.
 *
 *   • «تقویم من نزد چه کسانی» — اینجا کنترل دست ماست: می‌سازیم، اجازهٔ نوشتن
 *     صورت‌جلسه را روشن/خاموش می‌کنیم، پس می‌گیریم.
 *   • «تقویم چه کسانی نزد من» — اینجا فقط می‌توانیم از دید خودمان برداریمش؛
 *     کلیدِ نوشتن دستِ صاحب تقویم است و اینجا فقط وضعیتش را می‌بینیم.
 *
 * کلید «اجازهٔ نوشتن صورت‌جلسه» عمداً از خودِ ساختِ اشتراک جداست: اشتراک با
 * نوشتنِ خاموش ساخته می‌شود و روشن‌کردنش یک تصمیم جداگانه و آگاهانه است.
 */
export default function CalendarShares() {
  const store = useStore();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const already = useMemo(
    () => new Set(store.sharedByMe.map((s) => s.viewer)),
    [store.sharedByMe]);

  /** افرادی که هنوز تقویم را با آن‌ها به اشتراک نگذاشته‌ایم (و خودمان نیستیم). */
  const candidates = useMemo(
    () => Object.values(store.people)
      .filter((p) => p.id !== store.currentUser && !already.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    [store.people, store.currentUser, already]);

  const person = (id: string) => store.people[id];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!pick) { store.toast('اول یک نفر را انتخاب کنید', 'info'); return; }
    setBusy(true);
    await store.addShare(pick);
    setBusy(false);
    setPick('');
  }

  return (
    <>
      <form className="card def-form" onSubmit={add}>
        <div className="card-head"><h3>اشتراک تقویم من با یک نفر</h3></div>
        <div className="def-form-body">
          <div className="field"><label>این فرد تقویم من را ببیند</label>
            <select className="field-in" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !pick}>
            <IconPlus size={16} />{busy ? 'در حال ذخیره…' : 'اشتراک‌گذاری'}
          </button>
        </div>
        <p className="share-note">
          با اشتراک‌گذاری، این فرد جلسه‌های تقویم شما را در فهرست و تقویم می‌بیند.
          نوشتن در صورت‌جلسه <b>پیش‌فرض خاموش</b> است و فقط با کلید زیر روشن می‌شود.
        </p>
      </form>

      <h3 className="share-h">
        <IconShare size={16} />تقویم من نزد چه کسانی است
        <b className="num">{toFa(store.sharedByMe.length)}</b>
      </h3>
      {store.sharedByMe.length === 0 ? (
        <p className="share-empty">هنوز تقویمتان را با کسی به اشتراک نگذاشته‌اید.</p>
      ) : (
        <div className="def-list">
          {store.sharedByMe.map((s) => {
            const p = person(s.viewer);
            return (
              <div className="def-item" key={s.id}>
                <span className="ava sm" style={p ? { background: `linear-gradient(145deg,${p.color})` } : undefined}>
                  {initials(s.viewerName)}
                </span>
                <div>
                  <b>{s.viewerName}</b>
                  <small>{s.canWriteMinutes ? 'می‌بیند و در صورت‌جلسه می‌نویسد' : 'فقط می‌بیند'}</small>
                </div>
                <button className={'share-toggle' + (s.canWriteMinutes ? ' on' : '')}
                  onClick={() => store.setShareWrite(s.id, !s.canWriteMinutes)}
                  title="اجازهٔ نوشتن در صورت‌جلسهٔ جلسه‌های من">
                  {s.canWriteMinutes ? <IconEdit size={14} /> : <IconEye size={14} />}
                  <span>{s.canWriteMinutes ? 'نوشتن صورت‌جلسه: روشن' : 'نوشتن صورت‌جلسه: خاموش'}</span>
                </button>
                <button className="def-del" aria-label="برداشتن اشتراک" title="برداشتن اشتراک"
                  onClick={() => store.removeShare(s.id)}><IconTrash size={15} /></button>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="share-h">
        <IconEye size={16} />تقویم چه کسانی نزد من است
        <b className="num">{toFa(store.sharedWithMe.length)}</b>
      </h3>
      {store.sharedWithMe.length === 0 ? (
        <p className="share-empty">کسی تقویمش را با شما به اشتراک نگذاشته است.</p>
      ) : (
        <div className="def-list">
          {store.sharedWithMe.map((s) => {
            const p = person(s.owner);
            return (
              <div className="def-item" key={s.id}>
                <span className="ava sm" style={p ? { background: `linear-gradient(145deg,${p.color})` } : undefined}>
                  {initials(s.ownerName)}
                </span>
                <div>
                  <b>{s.ownerName}</b>
                  <small>{s.canWriteMinutes
                    ? 'می‌توانید در صورت‌جلسهٔ این تقویم بنویسید'
                    : 'فقط دیدن — نوشتن صورت‌جلسه اجازه ندارد'}</small>
                </div>
                <span className="def-badge">{s.canWriteMinutes ? 'دیدن + نوشتن' : 'فقط دیدن'}</span>
                <button className="def-del" aria-label="برداشتن از تقویم من" title="از دید من بردار"
                  onClick={() => store.removeShare(s.id)}><IconTrash size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
