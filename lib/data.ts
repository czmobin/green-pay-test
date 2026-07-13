import type { Person, Guest, Room, Meeting, MeetingType, MeetingStatus, MinuteType } from './types';

/* ---------- People ---------- */
export const people: Record<string, Person> = {
  ceo: { id: 'ceo', name: 'علیرضا صادقی', role: 'مدیرعامل', color: '#0E9F6E,#08281E' },
  sara: { id: 'sara', name: 'سارا محمدی', role: 'مدیر محصول', color: '#7C3AED,#4C1D95' },
  reza: { id: 'reza', name: 'رضا کریمی', role: 'مدیر فنی (CTO)', color: '#2F7FE4,#153E7E' },
  negar: { id: 'negar', name: 'نگار احمدی', role: 'مدیر مالی', color: '#D9930B,#7A4E00' },
  amir: { id: 'amir', name: 'امیر حسینی', role: 'مدیر بازاریابی', color: '#DC4B4B,#7A1F1F' },
  maryam: { id: 'maryam', name: 'مریم رضایی', role: 'مدیر منابع انسانی', color: '#0E9F6E,#0B5B3E' },
  hossein: { id: 'hossein', name: 'حسین موسوی', role: 'مدیر عملیات', color: '#0891B2,#0E4A5A' },
  elham: { id: 'elham', name: 'الهام نوری', role: 'مدیر فروش', color: '#DB2777,#831843' },
  jafari: { id: 'jafari', name: 'محمد جعفری', role: 'مدیر ریسک و تطبیق', color: '#4F46E5,#312E81' },
  zahra: { id: 'zahra', name: 'زهرا عباسی', role: 'مدیر پشتیبانی', color: '#059669,#064E3B' },
  kaveh: { id: 'kaveh', name: 'کاوه رستمی', role: 'توسعهٔ کسب‌وکار', color: '#B45309,#78350F' },
};

/* ---------- External guests ---------- */
export const guests: Record<string, Guest> = {
  bahram: { id: 'bahram', name: 'دکتر بهرام تهرانی', org: 'شاپرک', role: 'نمایندهٔ فنی' },
  leila: { id: 'leila', name: 'لیلا فراهانی', org: 'بانک ملت', role: 'مدیر همکاری‌ها' },
  saeed: { id: 'saeed', name: 'سعید مرادی', org: 'استارتاپ داتین', role: 'هم‌بنیان‌گذار' },
  kian: { id: 'kian', name: 'کیان عزیزی', org: 'بانک مرکزی', role: 'کارشناس نظارت' },
  nasrin: { id: 'nasrin', name: 'نسرین قاسمی', org: 'به‌پرداخت', role: 'مدیر محصول' },
  omid: { id: 'omid', name: 'امید صالحی', org: 'فرابوم', role: 'مدیر یکپارچه‌سازی' },
};

/* ---------- Rooms ---------- */
export const rooms: Record<string, Room> = {
  board: { id: 'board', name: 'اتاق هیئت مدیره', cap: '۱۴ نفر' },
  alborz: { id: 'alborz', name: 'اتاق کنفرانس البرز', cap: '۱۰ نفر' },
  damavand: { id: 'damavand', name: 'اتاق دماوند', cap: '۶ نفر' },
  sabalan: { id: 'sabalan', name: 'اتاق سبلان', cap: '۴ نفر' },
  online: { id: 'online', name: 'Google Meet', cap: 'آنلاین' },
};

/* ---------- Seed meetings ---------- */
export const seedMeetings: Meeting[] = [
  { id: 'm1', title: 'جلسهٔ هیئت مدیره — بازبینی فصلی Q۲', type: 'board', status: 'confirmed', day: 1, start: 9, end: 11, room: 'board', organizer: 'ceo', parts: ['ceo', 'sara', 'reza', 'negar', 'jafari'], guests: ['kian'], synced: true, agenda: [{ title: 'گزارش عملکرد مالی فصل بهار', dur: 25 }, { title: 'وضعیت تراکنش‌های درگاه پرداخت', dur: 20 }, { title: 'برنامهٔ توسعهٔ بازار ۱۴۰۴', dur: 30 }, { title: 'مصوبات و جمع‌بندی', dur: 20 }] },
  { id: 'm2', title: 'هماهنگی یکپارچه‌سازی با شاپرک', type: 'external', status: 'confirmed', day: 1, start: 11, end: 12, room: 'alborz', organizer: 'reza', parts: ['reza', 'hossein', 'jafari'], guests: ['bahram', 'omid'], synced: true, agenda: [{ title: 'بازبینی مستندات API نسخهٔ ۳', dur: 20 }, { title: 'الزامات امنیتی و PCI-DSS', dur: 25 }, { title: 'زمان‌بندی استقرار', dur: 15 }] },
  { id: 'm3', title: 'بازبینی محصول — داشبورد پذیرندگان', type: 'internal', status: 'confirmed', day: 1, start: 13, end: 14, room: 'damavand', organizer: 'sara', parts: ['sara', 'reza', 'amir', 'zahra'], guests: [], synced: false, agenda: [{ title: 'بازخورد کاربران نسخهٔ بتا', dur: 20 }, { title: 'اولویت‌بندی نقشهٔ راه', dur: 25 }, { title: 'طراحی جدید صفحهٔ تسویه', dur: 15 }] },
  { id: 'm4', title: 'جلسهٔ فروش سازمانی با بانک ملت', type: 'external', status: 'pending', day: 1, start: 15, end: 16, room: 'alborz', organizer: 'elham', parts: ['elham', 'kaveh', 'ceo'], guests: ['leila'], synced: true, agenda: [{ title: 'معرفی راهکار پرداخت سازمانی', dur: 20 }, { title: 'مدل قیمت‌گذاری و کارمزد', dur: 20 }, { title: 'گام‌های بعدی همکاری', dur: 20 }] },
  { id: 'm5', title: 'استندآپ تیم فنی', type: 'internal', status: 'confirmed', day: 2, start: 9, end: 9.5, room: 'damavand', organizer: 'reza', parts: ['reza', 'sara', 'zahra'], guests: [], synced: true, agenda: [{ title: 'وضعیت اسپرینت جاری', dur: 15 }, { title: 'موانع فنی', dur: 15 }] },
  { id: 'm6', title: 'وبینار آنلاین با فرابوم', type: 'online', status: 'confirmed', day: 2, start: 11, end: 12, room: 'online', organizer: 'kaveh', parts: ['kaveh', 'reza'], guests: ['omid', 'nasrin'], synced: true, agenda: [{ title: 'نمایش سرویس تسویهٔ آنی', dur: 30 }, { title: 'پرسش و پاسخ', dur: 30 }] },
  { id: 'm7', title: 'کمیتهٔ ریسک و تطبیق', type: 'internal', status: 'confirmed', day: 2, start: 14, end: 15.5, room: 'alborz', organizer: 'jafari', parts: ['jafari', 'negar', 'hossein', 'ceo'], guests: [], synced: false, agenda: [{ title: 'بازبینی گزارش‌های مشکوک', dur: 30 }, { title: 'به‌روزرسانی سیاست‌های KYC', dur: 30 }, { title: 'ممیزی داخلی', dur: 30 }] },
  { id: 'm8', title: 'مذاکره با استارتاپ داتین', type: 'external', status: 'pending', day: 3, start: 10, end: 11, room: 'damavand', organizer: 'kaveh', parts: ['kaveh', 'ceo', 'elham'], guests: ['saeed'], synced: true, agenda: [{ title: 'مدل مشارکت فنی', dur: 25 }, { title: 'اشتراک درآمد', dur: 20 }, { title: 'توافق‌نامهٔ اولیه', dur: 15 }] },
  { id: 'm9', title: 'جلسهٔ منابع انسانی — جذب نیرو', type: 'internal', status: 'confirmed', day: 3, start: 13, end: 14, room: 'sabalan', organizer: 'maryam', parts: ['maryam', 'reza', 'sara'], guests: [], synced: true, agenda: [{ title: 'بازبینی موقعیت‌های باز', dur: 20 }, { title: 'مصاحبه‌های این هفته', dur: 20 }] },
  { id: 'm10', title: 'بازبینی امنیت با به‌پرداخت', type: 'external', status: 'confirmed', day: 4, start: 9.5, end: 11, room: 'alborz', organizer: 'jafari', parts: ['jafari', 'reza', 'hossein'], guests: ['nasrin', 'bahram'], synced: true, agenda: [{ title: 'ممیزی امنیتی مشترک', dur: 30 }, { title: 'گزارش تست نفوذ', dur: 30 }, { title: 'برنامهٔ اصلاح', dur: 30 }] },
  { id: 'm11', title: 'جمع‌بندی هفتگی مدیران', type: 'internal', status: 'confirmed', day: 4, start: 16, end: 17, room: 'board', organizer: 'ceo', parts: ['ceo', 'sara', 'reza', 'negar', 'amir', 'maryam', 'hossein', 'elham', 'jafari', 'zahra', 'kaveh'], guests: [], synced: true, agenda: [{ title: 'گزارش هر واحد', dur: 30 }, { title: 'اهداف هفتهٔ آینده', dur: 20 }] },
];

/* ---------- Labels / helpers ---------- */
export const CURRENT_USER = 'ceo';
export const TODAY = 1; // یکشنبه
export const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه'];
export const dayNums = ['۲۰', '۲۱', '۲۲', '۲۳', '۲۴'];

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

export const minuteMeta: Record<MinuteType, { label: string; color: string; icon: string }> = {
  note: { label: 'یادداشت', color: '#6B7B73', icon: 'note' },
  decision: { label: 'تصمیم', color: '#0E9F6E', icon: 'decision' },
  task: { label: 'تسک', color: '#2F7FE4', icon: 'task' },
  reminder: { label: 'یادآور', color: '#D9930B', icon: 'reminder' },
  call: { label: 'تماس تلفنی', color: '#7C3AED', icon: 'call' },
};

/* Persian digits */
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
