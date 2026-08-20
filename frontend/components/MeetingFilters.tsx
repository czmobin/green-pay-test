'use client';
import React, { useMemo, useState } from 'react';
import Portal from './Portal';
import { useSheet } from './useSheet';
import DatePicker from './DatePicker';
import { toFa, normalizeFa, faDateShort } from '@/lib/data';
import type { Category, MeetingType, Room } from '@/lib/types';
import { IconFilter, IconX, IconSearch, IconCheck, IconChevron } from './Icons';

export type TimeF = 'all' | 'today' | 'week' | 'upcoming' | 'past' | 'range';
export type TypeF = 'all' | MeetingType;

export const TIME_LABELS: Record<TimeF, string> = {
  all: 'همه',
  today: 'امروز',
  week: 'این هفته',
  upcoming: 'پیشِ رو',
  past: 'گذشته',
  range: 'بازهٔ دلخواه',
};

export const TYPE_LABELS: Record<TypeF, string> = {
  all: 'همه',
  in_person: 'حضوری',
  online: 'آنلاین',
};

/** بالای این تعداد، جستجو لازم می‌شود (قاعدهٔ Autocomplete) */
const SEARCH_THRESHOLD = 8;

export interface FilterState {
  cats: string[];
  time: TimeF;
  /** بازهٔ دلخواه — فقط وقتی time === 'range' معنی دارد */
  from: string;
  to: string;
  type: TypeF;
  /** شناسهٔ محل جلسه؛ خالی یعنی همهٔ محل‌ها */
  room: string;
}

export const EMPTY_FILTERS: FilterState = {
  cats: [], time: 'all', from: '', to: '', type: 'all', room: '',
};

/** چند فیلتر فعال است؟ — عدد روی دکمهٔ فیلتر */
export function activeCount(v: FilterState): number {
  return v.cats.length + (v.time !== 'all' ? 1 : 0) + (v.type !== 'all' ? 1 : 0)
    + (v.room ? 1 : 0);
}

/**
 * فیلتر جلسات.
 *
 * تصمیم‌های اصلی، هرکدام برای رفع یک مشکل واقعی:
 *  ۱. دسته‌ها پشت یک دراپ‌داون جمع شده‌اند؛ باز که شود، جستجو و تیک دارد.
 *     فهرست بازِ ۱۷ دسته کل شیت را پر می‌کرد و اسکرول طولانی می‌ساخت.
 *  ۲. زمان با کنترل بخش‌بندی‌شده انتخاب می‌شود و «بازهٔ دلخواه» دو تقویم
 *     شمسی را باز می‌کند — یعنی حالت پیشرفته فقط وقتی دیده می‌شود که بخواهی.
 *  ۳. تعداد نتیجه زنده روی دکمهٔ بستن نوشته می‌شود تا پیش از اعمال معلوم باشد
 *     این فیلتر چه چیزی باقی می‌گذارد.
 */
export default function MeetingFilters({
  categories, counts, rooms, roomCounts, value, onChange, resultCount,
}: {
  categories: Category[];
  /** تعداد جلسهٔ هر دسته — مبنای مرتب‌سازی و پنهان‌کردن دسته‌های خالی */
  counts: Record<string, number>;
  rooms: Room[];
  /** تعداد جلسهٔ هر محل — محل بدون جلسه در فهرست نمی‌آید */
  roomCounts: Record<string, number>;
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const { setBox, dismiss } = useSheet(open, () => setOpen(false));

  const active = activeCount(value);

  const { used, empty } = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
      || a.name.localeCompare(b.name, 'fa'));
    return {
      used: sorted.filter((c) => (counts[c.id] ?? 0) > 0),
      empty: sorted.filter((c) => !(counts[c.id] ?? 0)),
    };
  }, [categories, counts]);

  /** فقط محل‌هایی که جلسه‌ای در آن‌ها هست — بقیه فقط فهرست را بلند می‌کنند */
  const usedRooms = useMemo(
    () => rooms.filter((r) => (roomCounts[r.id] ?? 0) > 0)
      .sort((a, b) => (roomCounts[b.id] ?? 0) - (roomCounts[a.id] ?? 0)),
    [rooms, roomCounts]);

  const nq = normalizeFa(q);
  const visible = useMemo(() => {
    const pool = nq ? [...used, ...empty] : (showEmpty ? [...used, ...empty] : used);
    return nq ? pool.filter((c) => normalizeFa(c.name).includes(nq)) : pool;
  }, [used, empty, showEmpty, nq]);

  const toggleCat = (id: string) =>
    onChange({ ...value, cats: value.cats.includes(id)
      ? value.cats.filter((x) => x !== id) : [...value.cats, id] });

  /** خلاصهٔ دسته‌های انتخاب‌شده روی دکمهٔ دراپ‌داون */
  const catSummary = value.cats.length === 0 ? 'همهٔ دسته‌ها'
    : value.cats.length <= 2
      ? value.cats.map((id) => categories.find((c) => c.id === id)?.name ?? id).join('، ')
      : `${toFa(value.cats.length)} دسته انتخاب شده`;

  const rangeSummary = value.from && value.to
    ? `${faDateShort(value.from)} تا ${faDateShort(value.to)}`
    : value.from ? `از ${faDateShort(value.from)}`
      : value.to ? `تا ${faDateShort(value.to)}` : '';

  return (
    <>
      {/* دکمهٔ فیلتر و — در صورت فعال‌بودن — پاک‌کردن همه. چیپ‌های دسته
          برداشته شدند: انتخاب واقعی داخل شیت انجام می‌شود و آن ردیف فقط
          یک سطر افقی می‌خواست. */}
      <div className="mf-bar">
        <button className={'mf-open' + (active > 0 ? ' on' : '')}
          onClick={() => setOpen(true)} aria-label="فیلترها" aria-expanded={open}>
          <IconFilter size={17} />
          <span>فیلتر</span>
          {active > 0 && <b className="num">{toFa(active)}</b>}
        </button>

        {active > 0 && (
          <button className="mf-wipe" onClick={() => onChange(EMPTY_FILTERS)}>
            <IconX size={14} />پاک کردن
          </button>
        )}
      </div>

      {/* ---------- خلاصهٔ فیلترهای فعال ---------- */}
      {active > 0 && (
        <div className="mf-active">
          {value.time !== 'all' && (
            <button className="mf-tag" onClick={() => onChange({ ...value, time: 'all', from: '', to: '' })}>
              {value.time === 'range' && rangeSummary ? rangeSummary : TIME_LABELS[value.time]}
              <IconX size={12} />
            </button>
          )}
          {value.type !== 'all' && (
            <button className="mf-tag" onClick={() => onChange({ ...value, type: 'all' })}>
              {TYPE_LABELS[value.type]}<IconX size={12} />
            </button>
          )}
          {value.room && (
            <button className="mf-tag" onClick={() => onChange({ ...value, room: '' })}>
              {rooms.find((r) => r.id === value.room)?.name ?? value.room}<IconX size={12} />
            </button>
          )}
          {value.cats.map((id) => {
            const c = categories.find((x) => x.id === id);
            return (
              <button key={id} className="mf-tag" onClick={() => toggleCat(id)}
                style={{ color: c?.color, background: `color-mix(in srgb,${c?.color ?? '#888'} 13%,transparent)` }}>
                {c?.name ?? id}<IconX size={12} />
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- شیت فیلتر ---------- */}
      {open && (
        <Portal>
          <div className="modal-overlay show mf-scrim" onClick={dismiss}>
            <div className="modal sm mf-sheet" ref={setBox} role="dialog" aria-modal="true"
              aria-label="فیلتر جلسات" onClick={(e) => e.stopPropagation()}>
              {/* ضربدر بستن گوشهٔ چپ می‌ماند، مستقل از اینکه «بازنشانی» باشد یا نه */}
              <div className="modal-head">
                <h2><IconFilter size={17} /> فیلتر جلسات</h2>
                {active > 0 && (
                  <button className="mf-reset" onClick={() => onChange(EMPTY_FILTERS)}>
                    بازنشانی
                  </button>
                )}
                <button className="close" onClick={dismiss} aria-label="بستن"><IconX size={17} /></button>
              </div>

              <div className="modal-body mf-body">
                {/* ---- زمان: کنترل بخش‌بندی‌شده، یک ردیف، یک ضربه ---- */}
                <section className="mf-sec">
                  <h3>زمان</h3>
                  <div className="mf-seg wrap" role="radiogroup" aria-label="بازهٔ زمانی">
                    {(Object.keys(TIME_LABELS) as TimeF[]).map((t) => (
                      <button key={t} role="radio" aria-checked={value.time === t}
                        className={value.time === t ? 'on' : ''}
                        onClick={() => onChange({ ...value, time: t })}>
                        {TIME_LABELS[t]}
                      </button>
                    ))}
                  </div>

                  {/* بازهٔ دلخواه فقط وقتی خواسته شود باز می‌شود */}
                  {value.time === 'range' && (
                    <div className="mf-range">
                      <div className="field">
                        <label>از تاریخ</label>
                        <DatePicker value={value.from} onChange={(iso) => onChange({ ...value, from: iso })} />
                      </div>
                      <div className="field">
                        <label>تا تاریخ</label>
                        <DatePicker value={value.to} min={value.from || undefined}
                          onChange={(iso) => onChange({ ...value, to: iso })} />
                      </div>
                      {value.from && value.to && value.to < value.from && (
                        <p className="mf-warn">تاریخ پایان باید بعد از تاریخ شروع باشد.</p>
                      )}
                    </div>
                  )}
                </section>

                {/* ---- نوع جلسه ---- */}
                <section className="mf-sec">
                  <h3>نوع جلسه</h3>
                  <div className="mf-seg" role="radiogroup" aria-label="نوع جلسه">
                    {(Object.keys(TYPE_LABELS) as TypeF[]).map((t) => (
                      <button key={t} role="radio" aria-checked={value.type === t}
                        className={value.type === t ? 'on' : ''}
                        onClick={() => onChange({ ...value, type: t })}>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </section>

                {/* ---- محل جلسه ---- */}
                <section className="mf-sec">
                  <h3>محل جلسه</h3>
                  <select className="field-in mf-room" value={value.room}
                    aria-label="محل جلسه"
                    onChange={(e) => onChange({ ...value, room: e.target.value })}>
                    <option value="">همهٔ محل‌ها</option>
                    {usedRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({toFa(roomCounts[r.id] ?? 0)})
                      </option>
                    ))}
                  </select>
                  {usedRooms.length === 0 && (
                    <p className="mf-empty">هیچ جلسه‌ای محل ثبت‌شده ندارد.</p>
                  )}
                </section>

                {/* ---- دسته‌بندی: دراپ‌داون، تا فهرست بلند شیت را پر نکند ---- */}
                <section className="mf-sec">
                  <h3>
                    دسته‌بندی
                    {value.cats.length > 0 && <span className="mf-n num">{toFa(value.cats.length)} انتخاب</span>}
                  </h3>

                  <button className={'mf-dd' + (catsOpen ? ' open' : '')} aria-expanded={catsOpen}
                    onClick={() => setCatsOpen((v) => !v)}>
                    <span className={'mf-dd-val' + (value.cats.length ? '' : ' none')}>{catSummary}</span>
                    <IconChevron size={16} className={catsOpen ? 'up' : ''} />
                  </button>

                  {catsOpen && (
                    <div className="mf-dd-panel">
                      {used.length + empty.length > SEARCH_THRESHOLD && (
                        <div className="mf-search">
                          <IconSearch size={15} />
                          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                            placeholder="جستجوی دسته…" aria-label="جستجوی دسته‌بندی" />
                          {q && <button onClick={() => setQ('')} aria-label="پاک کردن"><IconX size={14} /></button>}
                        </div>
                      )}

                      <ul className="mf-list">
                        {visible.map((c) => {
                          const n = counts[c.id] ?? 0;
                          const on = value.cats.includes(c.id);
                          return (
                            <li key={c.id}>
                              <button className={'mf-row' + (on ? ' on' : '')} onClick={() => toggleCat(c.id)}
                                aria-pressed={on}>
                                <span className="mf-box">{on && <IconCheck size={13} />}</span>
                                <i className="mf-dot" style={{ background: c.color }} />
                                <span className="mf-name">{c.name}</span>
                                <span className={'mf-count num' + (n ? '' : ' zero')}>{toFa(n)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {visible.length === 0 && (
                        <p className="mf-empty">دسته‌ای با «{q}» پیدا نشد.</p>
                      )}

                      {!nq && empty.length > 0 && (
                        <button className="mf-more" onClick={() => setShowEmpty((v) => !v)} aria-expanded={showEmpty}>
                          <IconChevron size={15} className={showEmpty ? 'up' : ''} />
                          {showEmpty
                            ? 'پنهان‌کردن دسته‌های بدون جلسه'
                            : `${toFa(empty.length)} دستهٔ بدون جلسه`}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <div className="modal-foot">
                <button className="btn btn-primary" onClick={dismiss}>
                  {resultCount > 0
                    ? <>نمایش <span className="num">{toFa(resultCount)}</span> جلسه</>
                    : 'نتیجه‌ای ندارد'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
