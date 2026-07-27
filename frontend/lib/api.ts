/**
 * کلاینت API — در production فرانت و بک هم‌دامنه‌اند و nginx مسیر /api را
 * به Django می‌دهد؛ برای توسعهٔ محلی می‌توان NEXT_PUBLIC_API_URL را ست کرد.
 */
import type { Category, Guest, Meeting, Minute, MinuteType, Organization, Person, Room } from './types';

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');

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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try { detail = JSON.stringify(await res.json()); } catch { /* پاسخ بدون JSON */ }
    throw new Error(`خطای سرور (${res.status}): ${detail}`);
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

export const api = {
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
