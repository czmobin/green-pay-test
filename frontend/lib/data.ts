/**
 * ثابت‌های نمایشی و توابع کمکی.
 * دادهٔ دامنه (افراد، جلسات، صورت‌جلسه‌ها…) از API می‌آید — به `lib/api.ts` و store نگاه کنید.
 */
import type { Category, MeetingStatus, MeetingType, MinuteType, Priority } from './types';

/* ---------- تاریخ و زمان واقعی ----------
   جلسات با تاریخ میلادی ISO از API می‌آیند؛ نمایش همه‌جا شمسی است. */

/** تاریخ امروز به‌صورت ISO (YYYY-MM-DD) در منطقهٔ زمانی محلی */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ساعت جاری به‌صورت اعشاری (۱۴:۳۰ → ۱۴.۵) */
export function nowHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** ISO → آبجکت Date در نیمه‌شب محلی (بدون لغزش منطقهٔ زمانی) */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateToISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, n: number): string {
  return dateToISO(new Date(isoToDate(iso).getTime() + n * 86400000));
}

/* ---------- نمایش شمسی ---------- */
import { dateToJ, jMonths, jWeekdays, faWeekday, type JDate } from './jalali';

export function isoToJ(iso: string): JDate {
  return dateToJ(isoToDate(iso));
}

/** «یکشنبه ۲۲ تیر» */
export function faDate(iso: string, withYear = false): string {
  const j = isoToJ(iso);
  const wd = jWeekdays[faWeekday(j.jy, j.jm, j.jd)];
  const base = `${wd} ${toFa(j.jd)} ${jMonths[j.jm - 1]}`;
  return withYear ? `${base} ${toFa(j.jy)}` : base;
}

/** «۲۲ تیر» بدون نام روز */
export function faDateShort(iso: string): string {
  const j = isoToJ(iso);
  return `${toFa(j.jd)} ${jMonths[j.jm - 1]}`;
}

/** برچسب نسبی: امروز / فردا / دیروز، وگرنه تاریخ */
export function faDateLabel(iso: string): string {
  const t = todayISO();
  if (iso === t) return 'امروز';
  if (iso === addDaysISO(t, 1)) return 'فردا';
  if (iso === addDaysISO(t, -1)) return 'دیروز';
  return faDate(iso);
}

/* ---------- برچسب‌ها و رنگ‌ها ---------- */
export const typeLabels: Record<MeetingType, string> = {
  in_person: 'حضوری',
  online: 'آنلاین',
};

export const statusLabels: Record<MeetingStatus, string> = {
  confirmed: 'تأییدشده',
  pending: 'در انتظار',
  cancelled: 'لغو‌شده',
  done: 'برگزارشده',
};

export const typeColor: Record<MeetingType, string> = {
  in_person: '#0E9F6E',
  online: '#D9930B',
};

export const priorityLabels: Record<Priority, string> = {
  low: 'کم', normal: 'عادی', high: 'زیاد', critical: 'خیلی زیاد',
};

export const priorityColor: Record<Priority, string> = {
  low: '#6B7B73', normal: '#0891B2', high: '#D9930B', critical: '#DC4B4B',
};



export const minuteMeta: Record<MinuteType, { label: string; color: string; icon: string }> = {
  note: { label: 'یادداشت', color: '#6B7B73', icon: 'note' },
  decision: { label: 'تصمیم', color: '#0E9F6E', icon: 'decision' },
  task: { label: 'تسک', color: '#2F7FE4', icon: 'task' },
  reminder: { label: 'یادآور', color: '#D9930B', icon: 'reminder' },
  call: { label: 'تماس تلفنی', color: '#7C3AED', icon: 'call' },
  letter: { label: 'نامه', color: '#0891B2', icon: 'letter' },
  file: { label: 'فایل', color: '#6B7B73', icon: 'file' },
};

/* پالت رنگ آواتار برای افراد تازه‌تعریف‌شده */
export const avatarPalette = [
  '#0E9F6E,#0B5B3E', '#2F7FE4,#153E7E', '#7C3AED,#4C1D95', '#D9930B,#7A4E00',
  '#DB2777,#831843', '#0891B2,#0E4A5A', '#B45309,#78350F', '#059669,#064E3B',
];

/* ---------- توابع کمکی ---------- */

/** یکسان‌سازی متن فارسی برای جستجو (ی/ي، ک/ك، نیم‌فاصله) */
export function normalizeFa(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** ارقام لاتین → فارسی */
export function toFa(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function fmtTime(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return toFa(h) + ':' + (m ? toFa(m) : '۰۰');
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (p[0]?.[0] ?? '') + (p[1]?.[0] ?? '');
}

export function categoryOf(categories: Record<string, Category>, id: string): Category {
  return categories[id] ?? { id, name: '—', color: 'var(--muted)' };
}
