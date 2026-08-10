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
/** فاصلهٔ روزها تا یک تاریخ ISO — منفی یعنی گذشته. */
export function daysUntil(iso: string): number {
  const a = isoToDate(todayISO()).getTime();
  const b = isoToDate(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** «سه‌شنبه» — نام روز هفتهٔ یک تاریخ ISO */
export function faWeekdayOf(iso: string): string {
  const j = isoToJ(iso);
  return jWeekdays[faWeekday(j.jy, j.jm, j.jd)];
}

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

/**
 * رنگ جلسه از دسته‌بندی‌اش می‌آید (همان رنگی که در پنل ادمین تعریف شده)،
 * نه از حضوری/آنلاین بودن. حضوری و آنلاین فقط یک برچسب‌اند.
 */
export function meetingColor(categories: Record<string, Category>, m: { category: string }): string {
  return categories[m.category]?.color || 'var(--brand)';
}

export const priorityLabels: Record<Priority, string> = {
  low: 'کم', normal: 'عادی', high: 'زیاد', critical: 'خیلی زیاد',
};

export const priorityColor: Record<Priority, string> = {
  low: '#6B7B73', normal: '#0891B2', high: '#D9930B', critical: '#DC4B4B',
};



export const minuteMeta: Record<MinuteType, { label: string; color: string; icon: string }> = {
  note: { label: 'یادداشت', color: '#6B7B73', icon: 'note' },
  decision: { label: 'تصمیم', color: '#2563EB', icon: 'decision' },
  // این نوع دیگر ساخته نمی‌شود؛ فقط برچسبِ آیتم‌های قدیمی است
  action: { label: 'اقدام', color: '#2F7FE4', icon: 'action' },
  reminder: { label: 'یادآور', color: '#D9930B', icon: 'reminder' },
  call: { label: 'تماس تلفنی', color: '#7C3AED', icon: 'call' },
  letter: { label: 'نامه', color: '#0891B2', icon: 'letter' },
  file: { label: 'فایل', color: '#6B7B73', icon: 'file' },
};

/* پالت رنگ آواتار برای افراد تازه‌تعریف‌شده */
export const avatarPalette = [
  '#2563EB,#1E3A8A', '#0891B2,#0E5A70', '#7C3AED,#4C1D95', '#D9930B,#7A4E00',
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
  // دقیقه همیشه دورقمی: بدون این، ۹:۰۵ به شکل «۹:۵» درمی‌آمد
  return `${toFa(h)}:${toFa(String(m).padStart(2, '0'))}`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (p[0]?.[0] ?? '') + (p[1]?.[0] ?? '');
}

export function categoryOf(categories: Record<string, Category>, id: string): Category {
  return categories[id] ?? { id, name: '—', color: 'var(--muted)' };
}

/** یک نشانی وب کامل است یا فقط شناسه/کد اتاق؟ */
export const isUrl = (v?: string | null) => !!v && /^https?:\/\//i.test(v.trim());

const MEET_HOSTS: [RegExp, string][] = [
  [/meet\.google\./i, 'Google Meet'],
  [/skyroom\./i, 'اسکای‌روم'],
  [/zoom\.(us|com)/i, 'Zoom'],
  [/teams\.(microsoft|live)\./i, 'Microsoft Teams'],
  [/adobeconnect|connect\..*\/|\/adobe/i, 'Adobe Connect'],
  [/bigbluebutton|bbb\./i, 'BigBlueButton'],
  [/webex\./i, 'Webex'],
  [/jitsi|meet\.jit\.si/i, 'Jitsi'],
  [/whereby\./i, 'Whereby'],
];

/** نام سرویس جلسهٔ آنلاین از روی لینک — برای برچسب دکمهٔ «پیوستن». */
export function meetPlatform(link?: string | null): string {
  if (!link) return '';
  for (const [re, name] of MEET_HOSTS) if (re.test(link)) return name;
  if (!isUrl(link)) return '';
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** «۱۲ مرداد، ۰۹:۳۰» — زمان یادآوری از تاریخ ISO و ساعت اعشاری. */
export function remindLabel(m: { remindDate?: string | null; remindHour?: number | null; when?: string }): string {
  if (m.remindDate) {
    const clock = m.remindHour == null ? '' : `، ${fmtTime(m.remindHour)}`;
    return `${faDate(m.remindDate)}${clock}`;
  }
  return m.when ?? '';        // دادهٔ متنیِ قدیمی
}
