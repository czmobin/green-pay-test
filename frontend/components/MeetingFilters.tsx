'use client';
import React, { useEffect, useMemo, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import Portal from './Portal';
import DatePicker from './DatePicker';
import { toFa, normalizeFa, faDateShort } from '@/lib/data';
import type { Category, MeetingType } from '@/lib/types';
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
}

export const EMPTY_FILTERS: FilterState = { cats: [], time: 'all', from: '', to: '', type: 'all' };

/** چند فیلتر فعال است؟ — عدد روی دکمهٔ فیلتر */
export function activeCount(v: FilterState): number {
  return v.cats.length + (v.time !== 'all' ? 1 : 0) + (v.type !== 'all' ? 1 : 0);
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
  categories, counts, value, onChange, resultCount,
}: {
  categories: Category[];
  /** تعداد جلسهٔ هر دسته — مبنای مرتب‌سازی و پنهان‌کردن دسته‌های خالی */
  counts: Record<string, number>;
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);   // تا انیمیشن بسته‌شدن فرصت اجرا پیدا کند
  const [q, setQ] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  /**
   * Portal یک تیک دیرتر رندر می‌کند، پس با تکیه بر `open` انیمیشن وقتی اجرا
   * می‌شد که شیت هنوز در DOM نبود. این state با callback ref دقیقاً لحظهٔ
   * سوارشدن گره پر می‌شود.
   */
  const [sheetEl, setSheetEl] = useState<HTMLDivElement | null>(null);


  /**
   * ورود شیت: پرده محو می‌شود، خودِ شیت از پایین بالا می‌آید و بخش‌هایش
   * پشت سر هم جا می‌افتند (قاعدهٔ modal-motion: حرکت باید بافت مکانی بدهد).
   * خروج کوتاه‌تر از ورود است تا بستن سریع حس شود (exit-faster-than-enter).
   */
  useGSAP(() => {
    if (!sheetEl) return;
    const box = sheetEl;
    const scrim = box.parentElement;
    const parts = box.querySelectorAll('.mf-sec, .modal-foot');

    // با کاهش حرکت، فقط ظاهر می‌شود؛ هیچ لغزش و مرحله‌ای در کار نیست
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set([scrim, box, parts], { clearProps: 'all' });
      return;
    }

    const tl = gsap.timeline();
    tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: .2, ease: 'power1.out' })
      .fromTo(box, { yPercent: 100 },
        { yPercent: 0, duration: .38, ease: 'back.out(1.05)', clearProps: 'transform' }, '<')
      .fromTo(parts, { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: .26, stagger: .06, ease: 'power2.out',
          clearProps: 'transform,opacity,visibility' }, '-=.2');
    return () => { tl.kill(); };
  }, { dependencies: [sheetEl] });

  function dismiss() {
    const box = sheetEl;
    if (!box || closing) { setOpen(false); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOpen(false); return; }
    setClosing(true);
    gsap.to(box, {
      yPercent: 100, duration: .24, ease: 'power2.in',
      onComplete: () => { setOpen(false); setClosing(false); },
    });
    gsap.to(box.parentElement, { opacity: 0, duration: .22, ease: 'power1.in' });
  }

  const active = activeCount(value);

  const { used, empty } = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
      || a.name.localeCompare(b.name, 'fa'));
    return {
      used: sorted.filter((c) => (counts[c.id] ?? 0) > 0),
      empty: sorted.filter((c) => !(counts[c.id] ?? 0)),
    };
  }, [categories, counts]);

  const nq = normalizeFa(q);
  const visible = useMemo(() => {
    const pool = nq ? [...used, ...empty] : (showEmpty ? [...used, ...empty] : used);
    return nq ? pool.filter((c) => normalizeFa(c.name).includes(nq)) : pool;
  }, [used, empty, showEmpty, nq]);

  // بستن با Escape — مثل هر شیت دیگری در اپ
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

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
            <div className="modal sm mf-sheet" ref={setSheetEl} role="dialog" aria-modal="true"
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
