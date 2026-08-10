/**
 * کلاینت API — در production فرانت و بک هم‌دامنه‌اند و nginx مسیر /api را
 * به Django می‌دهد؛ برای توسعهٔ محلی می‌توان NEXT_PUBLIC_API_URL را ست کرد.
 */
import type { AgendaItem, Category, Guest, Meeting, Minute, MinuteType, OrgKind, Organization, Person, Room } from './types';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
const ACCESS_KEY = 'gp-access';
const REFRESH_KEY = 'gp-refresh';

/* ---------- توکن‌های JWT ---------- */
let access: string | null = null;
let refresh: string | null = null;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  try {
    access = localStorage.getItem(ACCESS_KEY);
    refresh = localStorage.getItem(REFRESH_KEY);
  } catch { /* حالت خصوصی مرورگر */ }
  hydrated = true;
}

export function loadToken(): string | null {
  hydrate();
  return access;
}

export function setTokens(a: string | null, r?: string | null) {
  hydrate();
  access = a;
  if (r !== undefined) refresh = r;
  try {
    if (a) localStorage.setItem(ACCESS_KEY, a); else localStorage.removeItem(ACCESS_KEY);
    if (r !== undefined) {
      if (r) localStorage.setItem(REFRESH_KEY, r); else localStorage.removeItem(REFRESH_KEY);
    }
  } catch { /* حالت خصوصی مرورگر */ }
}

/** پاک کردن نشست (خروج یا انقضای توکن) */
export function setToken(value: string | null) {
  setTokens(value, value ? undefined : null);
}

/** تلاش برای گرفتن access تازه با refresh؛ در صورت شکست نشست پاک می‌شود. */
async function tryRefresh(): Promise<boolean> {
  hydrate();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    setTokens(data.access, data.refresh ?? refresh);
    return true;
  } catch {
    setTokens(null, null);
    return false;
  }
}

/** وقتی سرور توکن را نپذیرد، همین خطا پرتاب می‌شود تا اپ به صفحهٔ ورود برگردد. */
export class UnauthorizedError extends Error {
  constructor() { super('نشست شما منقضی شده است.'); }
}

export interface Bootstrap {
  organizations: Record<string, Organization>;
  orgKinds: Record<string, OrgKind>;
  categories: Record<string, Category>;
  rooms: Record<string, Room>;
  people: Record<string, Person>;
  guests: Record<string, Guest>;
  meetings: Meeting[];
  minutes: Record<string, Minute[]>;
  currentUser: string | null;
  gcalConnected: boolean;
  smsEnabled: boolean;
}

async function request<T>(path: string, init?: RequestInit, retry = true, isForm = false): Promise<T> {
  const auth = loadToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // برای FormData هدر را مرورگر می‌گذارد (boundary لازم دارد)
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    // توکن منقضی شده — یک‌بار با refresh تازه‌اش می‌کنیم
    if (await tryRefresh()) return request<T>(path, init, false, isForm);
  }
  if (res.status === 401 || res.status === 403) {
    setTokens(null, null);
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body);
    } catch { detail = `کد ${res.status}`; }
    const err = new Error(detail) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export interface NewMeeting {
  title: string;
  category: string;
  type: Meeting['type'];
  date: string;
  start: number;
  end: number;
  room?: string;
  organizer: string;
  parts: string[];
  guests?: string[];
  synced?: boolean;
  priority?: Meeting['priority'];
  meetLink?: string;
  /** فاصلهٔ یادآور پیش‌فرض برای همهٔ شرکت‌کنندگان (دقیقه؛ صفر = خاموش) */
  reminderLead?: number;
}

/** فیلدهای قابل ویرایش جلسه */
export type MeetingPatch = Partial<Omit<NewMeeting, 'organizer'>>;

/** تداخل زمانی یک شرکت‌کننده با جلسه‌ای دیگر — فقط هشدار است. */
export interface Conflict {
  user: string;
  userName: string;
  meeting: string;
  meetingTitle: string;
  date: string;
  start: number;
  end: number;
  room?: string;
}

export type CreatedMeeting = Meeting & { conflicts?: Conflict[] };

export interface NewMinute {
  meeting: string;
  participant?: string | null;
  type: MinuteType;
  text: string;
  /** زمان یادآوری — تاریخ میلادی ISO و ساعت اعشاری (۹:۳۰ → ۹.۵) */
  remindDate?: string | null;
  remindHour?: number | null;
  when?: string;
  who?: string;
  phone?: string;
  fileName?: string;
  /** بند دستور جلسه‌ای که این آیتم ذیل آن مطرح شد (اختیاری) */
  agendaItem?: string | null;
}

/** فیلدهای قابل ویرایش یک آیتم صورت‌جلسه (نوعش عوض نمی‌شود) */
export interface MinutePatch {
  text?: string;
  remindDate?: string | null;
  remindHour?: number | null;
  who?: string;
  phone?: string;
  agendaItem?: string | null;
}

export interface OtpRequestResult {
  ok: boolean;
  phone: string;
  expiresIn: number;
  resendAfter: number;
  smsSent: boolean;
  isKnown: boolean;   // شماره از قبل ثبت شده؟ (ورود در برابر ثبت‌نام)
  devCode?: string;   // فقط وقتی سرویس پیامک خاموش است (محیط توسعه)
}

/** یادآور پیامکی جلسه — برای هر کاربر و هر جلسه جداگانه تنظیم می‌شود. */
export interface MeetingReminder {
  leadMinutes: number;
  enabled: boolean;
  sendDate: string;
  sendHour: number;
  sentAt: number | null;
  error: string;
  /** شناسهٔ پیام نزد سرویس پیامک — برای پیگیری گزارش تحویل */
  msgId: string;
  /** وضعیت تحویل به گوشی، اگر از سرویس خوانده شده باشد */
  delivery: string;
  delivered: boolean | null;
  applies: boolean;
  hasPhone: boolean;
  choices: number[];
}

/* ---------- گزارش کامل (فقط ادمین و مدیرعامل) ---------- */
export interface ReportAlert {
  level: 'high' | 'mid' | 'low';
  kind: string;
  title: string;
  detail: string;
  count: number;
  hint: string;
}
export interface ReportMeeting {
  id: string; title: string; date: string; start: number; hours: number;
  organizer: string; organizerName: string; people: number;
  category: string; categoryColor: string; entries?: number;
}
export interface ReportReminder {
  id: string; text: string; when: string; meeting: string; meetingTitle: string;
}
export interface ReportInvite {
  user: string; userName: string; meeting: string; meetingTitle: string; date: string;
}
export interface ReportPerson {
  id: string; name: string; role: string; color: string;
  meetings: number; hours: number;
  organized: number; organizedPast: number; organizedWithMinutes: number;
  pendingInvites: number; entriesWritten: number;
  minuteRate: number;
}
export interface ReportCategory {
  id: string; name: string; color: string;
  meetings: number; past: number; hours: number; withAction: number; actionRate: number;
}
export interface FullReport {
  days: number; from: string; to: string;
  totals: {
    meetings: number; past: number; hours: number; avgLength: number;
    minuteRate: number; actionRate: number;
    reminders: number; remindersStale: number; wastedHours: number;
  };
  alerts: ReportAlert[];
  deadMeetings: ReportMeeting[];
  noActionMeetings: ReportMeeting[];
  staleReminders: ReportReminder[];
  unanswered: ReportInvite[];
  silentOrganizers: ReportPerson[];
  people: ReportPerson[];
  categories: ReportCategory[];
}

export const api = {
  requestOtp: (phone: string) => post<OtpRequestResult>('/auth/request-otp/', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ access: string; refresh: string; user: Person; isNew: boolean }>(
      '/auth/verify-otp/', { phone, code }),
  me: () => request<Person & { isNew?: boolean; phone?: string }>('/auth/me/'),
  updateProfile: (p: { firstName: string; lastName: string; title?: string }) =>
    request<Person & { isNew?: boolean }>('/auth/me/', { method: 'PATCH', body: JSON.stringify(p) }),
  logout: () => post<{ ok: boolean }>('/auth/logout/'),

  loginPassword: (phone: string, password: string) =>
    post<{ access: string; refresh: string; user: Person; isNew: boolean }>(
      '/auth/login/', { phone, password }),
  passwordState: () => request<{ hasPassword: boolean }>('/auth/password/'),
  setPassword: (p: { newPassword: string; currentPassword?: string }) =>
    post<{ hasPassword: boolean; ok: boolean }>('/auth/password/', p),
  /** گام اول فراموشی رمز: کد را مصرف می‌کند و بلیت ۱۵ دقیقه‌ای می‌دهد */
  verifyReset: (phone: string, code: string) =>
    post<{ ticket: string; expiresIn: number }>('/auth/verify-reset/', { phone, code }),
  resetPassword: (p: { ticket: string; newPassword: string }) =>
    post<{ access: string; refresh: string; user: Person; isNew: boolean }>(
      '/auth/reset-password/', p),

  bootstrap: () => request<Bootstrap>('/bootstrap/'),
  report: (days: number) => request<FullReport>(`/reports/full/?days=${days}`),

  createMeeting: (m: NewMeeting) => post<CreatedMeeting>('/meetings/', m),
  updateMeeting: (id: string, patch: MeetingPatch) =>
    request<CreatedMeeting>(`/meetings/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) }),
  checkConflicts: (q: { date: string; start: number; end: number; parts: string[]; guests?: string[] }) =>
    post<{ conflicts: Conflict[] }>('/meetings/check-conflicts/', q),

  createAgenda: (a: { meeting: string; title: string; dur: number }) =>
    post<AgendaItem>('/agenda/', a),
  updateAgenda: (id: string, a: { title?: string; dur?: number; order?: number }) =>
    request<AgendaItem>(`/agenda/${id}/`, { method: 'PATCH', body: JSON.stringify(a) }),
  deleteAgenda: (id: string) => request<void>(`/agenda/${id}/`, { method: 'DELETE' }),
  respondMeeting: (id: string, accept: boolean) => post<Meeting>(`/meetings/${id}/respond/`, { accept }),
  cancelMeeting: (id: string, reason: string) =>
    post<Meeting & { smsSent: number; smsFailed: number }>(`/meetings/${id}/cancel/`, { reason }),
  updateMinute: (id: string, patch: MinutePatch) =>
    request<Minute>(`/entries/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getReminder: (id: string) => request<MeetingReminder>(`/meetings/${id}/reminder/`),
  setReminder: (id: string, body: { leadMinutes?: number; enabled?: boolean }) =>
    post<MeetingReminder>(`/meetings/${id}/reminder/`, body),
  syncMeeting: (id: string) => post<Meeting>(`/meetings/${id}/sync/`),

  createMinute: (m: NewMinute) => post<Minute>('/entries/', m),
  deleteMinute: (id: string) => request<void>(`/entries/${id}/`, { method: 'DELETE' }),
  toggleMinute: (id: string) => post<Minute>(`/entries/${id}/toggle/`),

  createOrg: (o: { name: string; kind: string }) => post<Organization>('/organizations/', o),
  createPerson: (p: { name: string; role: string; orgId: string; color?: string }) => post<Person>('/people/', p),
  createGuest: (g: { name: string; role?: string; org?: string }) => post<Guest>('/guests/', g),
  importPeople: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    // بدون Content-Type تا مرورگر خودش boundary فرم را بگذارد
    return request<{ created: number; skipped: number; messages: string[]; people: Record<string, Person> }>(
      '/people/import/', { method: 'POST', body, headers: {} }, true, true);
  },
  createRoom: (r: { name: string; cap: string; orgId: string; address?: string; lat?: number | null; lng?: number | null }) =>
    post<Room>('/locations/', r),
  deleteOrg: (id: string) => request<void>(`/organizations/${id}/`, { method: 'DELETE' }),
  deletePerson: (id: string) => request<void>(`/people/${id}/`, { method: 'DELETE' }),
  deleteRoom: (id: string) => request<void>(`/locations/${id}/`, { method: 'DELETE' }),
  updateRoom: (id: string, patch: { name?: string; cap?: string; address?: string; lat?: number | null; lng?: number | null }) =>
    request<Room>(`/locations/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) }),

  setGcal: (connected: boolean) => post<{ gcalConnected: boolean }>('/settings/gcal/', { connected }),
  setSms: (enabled: boolean) => post<{ smsEnabled: boolean }>('/settings/sms/', { enabled }),
};
