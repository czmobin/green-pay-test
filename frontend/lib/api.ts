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

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const auth = loadToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    // توکن منقضی شده — یک‌بار با refresh تازه‌اش می‌کنیم
    if (await tryRefresh()) return request<T>(path, init, false);
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
  assignee?: string | null;
  due?: string | null;
  when?: string;
  who?: string;
  phone?: string;
  fileName?: string;
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

export const api = {
  requestOtp: (phone: string) => post<OtpRequestResult>('/auth/request-otp/', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ access: string; refresh: string; user: Person; isNew: boolean }>(
      '/auth/verify-otp/', { phone, code }),
  me: () => request<Person & { isNew?: boolean; phone?: string }>('/auth/me/'),
  updateProfile: (p: { firstName: string; lastName: string; title?: string }) =>
    request<Person & { isNew?: boolean }>('/auth/me/', { method: 'PATCH', body: JSON.stringify(p) }),
  logout: () => post<{ ok: boolean }>('/auth/logout/'),

  bootstrap: () => request<Bootstrap>('/bootstrap/'),

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
  syncMeeting: (id: string) => post<Meeting>(`/meetings/${id}/sync/`),

  createMinute: (m: NewMinute) => post<Minute>('/entries/', m),
  deleteMinute: (id: string) => request<void>(`/entries/${id}/`, { method: 'DELETE' }),
  toggleMinute: (id: string) => post<Minute>(`/entries/${id}/toggle/`),

  createOrg: (o: { name: string; kind: string }) => post<Organization>('/organizations/', o),
  createPerson: (p: { name: string; role: string; orgId: string; color?: string }) => post<Person>('/people/', p),
  createRoom: (r: { name: string; cap: string; orgId: string }) => post<Room>('/locations/', r),
  deleteOrg: (id: string) => request<void>(`/organizations/${id}/`, { method: 'DELETE' }),
  deletePerson: (id: string) => request<void>(`/people/${id}/`, { method: 'DELETE' }),
  deleteRoom: (id: string) => request<void>(`/locations/${id}/`, { method: 'DELETE' }),

  setGcal: (connected: boolean) => post<{ gcalConnected: boolean }>('/settings/gcal/', { connected }),
  setSms: (enabled: boolean) => post<{ smsEnabled: boolean }>('/settings/sms/', { enabled }),
};
