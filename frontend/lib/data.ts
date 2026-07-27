/**
 * ثابت‌های نمایشی و توابع کمکی.
 * دادهٔ دامنه (افراد، جلسات، صورت‌جلسه‌ها…) از API می‌آید — به `lib/api.ts` و store نگاه کنید.
 */
import type { Category, MeetingStatus, MeetingType, MinuteType, Organization } from './types';

/* ---------- لنگر تقویم دمو ----------
   هفتهٔ شنبه ۲۱ تا چهارشنبه ۲۵ تیر ۱۴۰۴ (امروز = یکشنبه ۲۲، ساعت ۱۴:۳۰).
   بک‌اند همین بازه را با datetime واقعی نگه می‌دارد و اندیس روز را برمی‌گرداند. */
export const TODAY = 1;
export const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه'];
export const dayNums = ['۲۱', '۲۲', '۲۳', '۲۴', '۲۵'];
export const CAL_YEAR = 1404;
export const CAL_MONTH = 4;
export const BASE_JD = 21;
export const TODAY_J = { jy: 1404, jm: 4, jd: 22 };
export const NOW_HOUR = 14.5;
export function meetingJd(day: number): number { return BASE_JD + day; }

/* ---------- برچسب‌ها و رنگ‌ها ---------- */
export const typeLabels: Record<MeetingType, string> = {
  board: 'هیئت مدیره',
  external: 'با مهمان خارجی',
  internal: 'داخلی',
  online: 'آنلاین',
};

export const statusLabels: Record<MeetingStatus, string> = {
  confirmed: 'تأییدشده',
  pending: 'در انتظار',
  cancelled: 'لغو‌شده',
  done: 'برگزارشده',
};

export const typeColor: Record<MeetingType, string> = {
  board: '#7C3AED',
  external: '#2F7FE4',
  internal: '#0E9F6E',
  online: '#D9930B',
};

export const orgKindLabels: Record<Organization['kind'], string> = {
  internal: 'داخلی', bank: 'بانک', regulator: 'رگولاتور', partner: 'شریک',
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
