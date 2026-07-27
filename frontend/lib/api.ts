/**
 * کلاینت API — در production فرانت و بک هم‌دامنه‌اند و nginx مسیر /api را
 * به Django می‌دهد؛ برای توسعهٔ محلی می‌توان NEXT_PUBLIC_API_URL را ست کرد.
 */
import type { Category, Guest, Meeting, Minute, MinuteType, Organization, Person, Room } from './types';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'gp-token';

/* ---------- توکن ورود ---------- */
let token: string | null = null;

export function loadToken(): string | null {
  if (token === null && typeof window !== 'undefined') {
    try { token = localStorage.getItem(TOKEN_KEY); } catch { /* حالت خصوصی */ }
  }
  return token;
}

export function setToken(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* حالت خصوصی */ }
}

/** وقتی سرور توکن را نپذیرد، همین خطا پرتاب می‌شود تا اپ به صفحهٔ ورود برگردد. */
export class UnauthorizedError extends Error {
  constructor() { super('نشست شما منقضی شده است.'); }
}

export interface Bootstrap {
  organizations: Record<string, Organization>;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = loadToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) {
    setToken(null);
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
  day: number;
  start: number;
  end: number;
  room: string;
  organizer: string;
  parts: string[];
  guests?: string[];
  synced?: boolean;
}

export interface NewMinute {
  meeting: string;
  participant?: string | null;
  type: MinuteType;
  text: string;
  assignee?: string | null;
  due?: string;
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
  devCode?: string;   // فقط وقتی سرویس پیامک خاموش است (محیط توسعه)
}

export const api = {
  requestOtp: (phone: string) => post<OtpRequestResult>('/auth/request-otp/', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ token: string; user: Person }>('/auth/verify-otp/', { phone, code }),
  me: () => request<Person>('/auth/me/'),
  logout: () => post<{ ok: boolean }>('/auth/logout/'),

  bootstrap: () => request<Bootstrap>('/bootstrap/'),

  createMeeting: (m: NewMeeting) => post<Meeting>('/meetings/', m),
  respondMeeting: (id: string, accept: boolean) => post<Meeting>(`/meetings/${id}/respond/`, { accept }),
  syncMeeting: (id: string) => post<Meeting>(`/meetings/${id}/sync/`),

  createMinute: (m: NewMinute) => post<Minute>('/entries/', m),
  deleteMinute: (id: string) => request<void>(`/entries/${id}/`, { method: 'DELETE' }),
  toggleMinute: (id: string) => post<Minute>(`/entries/${id}/toggle/`),

  createOrg: (o: { name: string; kind: Organization['kind'] }) => post<Organization>('/organizations/', o),
  createPerson: (p: { name: string; role: string; orgId: string; color?: string }) => post<Person>('/people/', p),
  createRoom: (r: { name: string; cap: string; orgId: string }) => post<Room>('/locations/', r),

  setGcal: (connected: boolean) => post<{ gcalConnected: boolean }>('/settings/gcal/', { connected }),
  setSms: (enabled: boolean) => post<{ smsEnabled: boolean }>('/settings/sms/', { enabled }),
};
