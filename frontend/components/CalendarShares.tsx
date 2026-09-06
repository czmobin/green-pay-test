'use client';
import React, { useMemo, useState } from 'react';
import { useStore } from './store';
import { initials, normalizeFa, toFa } from '@/lib/data';
import { IconPlus, IconTrash, IconShare, IconEye, IconEdit, IconSearch } from './Icons';

/** چند نفر پیش از جستجو نشان داده می‌شوند — مثل فرم ساخت جلسه */
const PEOPLE_SHOWN = 20;

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
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
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

  /**
   * فهرست نمایش — بدون جستجو فقط PEOPLE_SHOWN نفر، و بقیه با جستجو.
   *
   * انتخاب‌شده‌ها **همیشه** اول فهرست می‌مانند، حتی وقتی با جستجوی فعلی جور
   * نیستند: وگرنه کاربر دو نفر انتخاب می‌کرد، کلمهٔ بعدی را تایپ می‌کرد و
   * شمارنده می‌گفت «۲» در حالی که فقط یکی دیده می‌شد.
   */
  const shown = useMemo(() => {
    const nq = normalizeFa(q);
    const sel = candidates.filter((p) => picked.includes(p.id));
    const rest = candidates.filter((p) => !picked.includes(p.id));
    if (nq) return [...sel, ...rest.filter((p) => normalizeFa(p.name + ' ' + p.role).includes(nq))];
    return [...sel, ...rest].slice(0, PEOPLE_SHOWN);
  }, [candidates, picked, q]);

  const hidden = candidates.length - shown.length;
  const person = (id: string) => store.people[id];
  const toggle = (id: string) =>
    setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) { store.toast('اول دست‌کم یک نفر را انتخاب کنید', 'info'); return; }
    setBusy(true);
    await store.addShare(picked);
    setBusy(false);
    setPicked([]);
    setQ('');
  }

  return (
    <>
      <form className="card def-form" onSubmit={add}>
        <div className="card-head"><h3>اشتراک تقویم من با دیگران</h3></div>
        <div className="def-form-body share-form-body">
          <div className="field">
            <label>این افراد تقویم من را ببینند ({toFa(picked.length)})</label>
            <div className="pp-search">
              <IconSearch size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="جستجوی نام یا سمت…" />
            </div>
            <div className="people-pick">
              {shown.map((p) => (
                <button type="button" key={p.id}
                  className={'ppick' + (picked.includes(p.id) ? ' active' : '')}
                  onClick={() => toggle(p.id)}>
                  <span className="ava sm" style={{ background: `linear-gradient(145deg,${p.color})` }}>
                    {initials(p.name)}
                  </span>
                  {p.name}
                </button>
              ))}
              {shown.length === 0 && (
                <div className="share-empty-inline">
                  {candidates.length === 0
                    ? 'تقویمتان با همه به اشتراک گذاشته شده است.'
                    : 'کسی پیدا نشد.'}
                </div>
              )}
            </div>
            {!q && hidden > 0 && (
              <div className="pp-more">{toFa(hidden)} نفر دیگر — برای دیدنشان جستجو کنید.</div>
            )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !picked.length}>
            <IconPlus size={16} />
            {busy ? 'در حال ذخیره…'
              : picked.length > 1 ? `اشتراک‌گذاری با ${toFa(picked.length)} نفر` : 'اشتراک‌گذاری'}
          </button>
        </div>
        <p className="share-note">
          با اشتراک‌گذاری، این افراد جلسه‌های تقویم شما را در فهرست و تقویم می‌بینند.
          نوشتن در صورت‌جلسه <b>پیش‌فرض خاموش</b> است و برای هر نفر جداگانه با کلید زیر روشن می‌شود.
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
