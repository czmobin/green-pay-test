'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  AgendaItem, Category, Guest, Meeting, Minute, OrgKind, Organization, Person, Role, Room,
} from '@/lib/types';
import {
  api, loadToken, setTokens, UnauthorizedError,
  type Conflict, type MeetingPatch, type NewMeeting, type NewMinute,
} from '@/lib/api';
import { IconCheck, IconX } from './Icons';

type ToastKind = 'ok' | 'info' | 'load';
interface Toast { id: number; msg: string; kind: ToastKind }

interface Store {
  /* احراز هویت */
  authed: boolean;
  authChecked: boolean;
  needsProfile: boolean;
  me: Person | null;
  signIn: (tokens: { access: string; refresh: string }, user: Person, isNew: boolean) => void;
  completeProfile: (p: { firstName: string; lastName: string; title?: string }) => Promise<boolean>;
  signOut: () => Promise<void>;

  /* وضعیت بارگذاری از API */
  ready: boolean;
  error: string | null;
  reload: () => Promise<void>;

  /* دادهٔ دامنه */
  meetings: Meeting[];
  visibleMeetings: Meeting[];
  minutes: Record<string, Minute[]>;
  people: Record<string, Person>;
  guests: Record<string, Guest>;
  rooms: Record<string, Room>;
  orgs: Record<string, Organization>;
  orgKinds: Record<string, OrgKind>;
  categories: Record<string, Category>;

  getMeeting: (id: string) => Meeting | undefined;
  canEdit: (m: Meeting) => boolean;
  createMeeting: (m: NewMeeting) => Promise<Meeting | null>;
  updateMeeting: (id: string, patch: MeetingPatch) => Promise<Meeting | null>;
  addAgenda: (meetingId: string, item: { title: string; dur: number }) => Promise<void>;
  updateAgenda: (meetingId: string, id: string, item: { title?: string; dur?: number }) => Promise<void>;
  deleteAgenda: (meetingId: string, id: string) => Promise<void>;
  respondMeeting: (id: string, accept: boolean) => Promise<void>;
  syncMeeting: (id: string) => Promise<void>;

  addMinute: (m: NewMinute) => Promise<void>;
  deleteMinute: (meetingId: string, id: string) => Promise<void>;
  toggleTask: (meetingId: string, id: string) => Promise<void>;

  addPerson: (p: { name: string; role: string; orgId: string; color?: string }) => Promise<void>;
  addRoom: (r: { name: string; cap: string; orgId: string }) => Promise<void>;
  addOrg: (o: { name: string; kind: string }) => Promise<void>;

  /* دسترسی و تنظیمات */
  role: Role;
  currentUser: string;
  setRole: (r: Role) => void;
  setCurrentUser: (id: string) => void;
  gcalConnected: boolean;
  connectGcal: () => Promise<void>;
  smsEnabled: boolean;
  toggleSms: () => Promise<void>;

  /* هشدار تداخل زمانی شرکت‌کنندگان (فقط اطلاع‌رسانی) */
  conflicts: Conflict[];
  dismissConflicts: () => void;

  /* رابط کاربری */
  createOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  toast: (msg: string, kind?: ToastKind) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within Providers');
  return c;
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [me, setMe] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [minutes, setMinutes] = useState<Record<string, Minute[]>>({});
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [guests, setGuests] = useState<Record<string, Guest>>({});
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [orgs, setOrgs] = useState<Record<string, Organization>>({});
  const [orgKinds, setOrgKinds] = useState<Record<string, OrgKind>>({});
  const [categories, setCategories] = useState<Record<string, Category>>({});

  const [role, setRole] = useState<Role>('ceo');
  const [currentUser, setCurrentUser] = useState<string>('');
  const [gcalConnected, setGcal] = useState(false);
  const [smsEnabled, setSms] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  /* ---------- احراز هویت ---------- */
  const signIn = useCallback((tokens: { access: string; refresh: string }, user: Person, isNew: boolean) => {
    setTokens(tokens.access, tokens.refresh);
    setMe(user);
    setAuthed(true);
    setNeedsProfile(isNew);
    setCurrentUser(user.id);
    setRole(user.accessRole === 'ceo' ? 'ceo' : user.accessRole === 'admin' ? 'admin' : 'user');
    setReady(false);            // داده‌ها با توکن جدید دوباره خوانده می‌شوند
  }, []);

  const completeProfile = useCallback(async (p: { firstName: string; lastName: string; title?: string }) => {
    try {
      const user = await api.updateProfile(p);
      setMe(user);
      setNeedsProfile(false);
      setPeople((s) => ({ ...s, [user.id]: user }));
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ثبت اطلاعات ناموفق بود', 'info');
      return false;
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* توکن در هر حال پاک می‌شود */ }
    setTokens(null, null);
    setAuthed(false);
    setNeedsProfile(false);
    setMe(null);
    setReady(true);
    setMeetings([]); setMinutes({}); setPeople({}); setGuests({});
    setRooms({}); setOrgs({}); setOrgKinds({}); setCategories({});
  }, []);

  /* ---------- بارگذاری اولیه ---------- */
  const reload = useCallback(async () => {
    try {
      const d = await api.bootstrap();
      setMeetings(d.meetings);
      setMinutes(d.minutes);
      setPeople(d.people);
      setGuests(d.guests);
      setRooms(d.rooms);
      setOrgs(d.organizations);
      setOrgKinds(d.orgKinds ?? {});
      setCategories(d.categories);
      setGcal(d.gcalConnected);
      setSms(d.smsEnabled);
      setCurrentUser((cur) => cur || d.currentUser || '');
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAuthed(false);
        setMe(null);
      } else {
        setError(e instanceof Error ? e.message : 'ارتباط با سرور برقرار نشد');
      }
    } finally {
      setReady(true);
    }
  }, []);

  // بررسی توکن ذخیره‌شده در نخستین رندر سمت مرورگر
  useEffect(() => {
    const tok = loadToken();
    if (!tok) { setAuthChecked(true); setReady(true); return; }
    api.me()
      .then((user) => {
        setMe(user);
        setAuthed(true);
        setNeedsProfile(Boolean(user.isNew));
        setCurrentUser((c) => c || user.id);
        setRole(user.accessRole === 'ceo' ? 'ceo' : user.accessRole === 'admin' ? 'admin' : 'user');
      })
      .catch(() => { setTokens(null, null); setAuthed(false); })
      .finally(() => setAuthChecked(true));
  }, []);

  // داده‌ها فقط وقتی احراز هویت شده‌ایم خوانده می‌شوند
  useEffect(() => {
    if (authed && !ready) void reload();
  }, [authed, ready, reload]);

  /* ---------- کمکی: اجرای امن یک عملیات نوشتن ---------- */
  const guarded = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'عملیات ناموفق بود', 'info');
      return null;
    }
  }, [toast]);

  /* ---------- جلسات ---------- */
  const getMeeting = useCallback((id: string) => meetings.find((m) => m.id === id), [meetings]);

  const upsertMeeting = (m: Meeting) =>
    setMeetings((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m]));

  const createMeeting = useCallback(async (payload: NewMeeting) =>
    guarded(async () => {
      const created = await api.createMeeting(payload);
      upsertMeeting(created);
      // تداخل‌ها فقط نمایش داده می‌شوند و جلوی ساخت جلسه یا افزودن فرد را نمی‌گیرند
      setConflicts(created.conflicts ?? []);
      return created;
    }), [guarded]);

  /** سازندهٔ جلسه، مدیرعامل و ادمین اجازهٔ ویرایش دارند (هم‌سو با قانون بک‌اند). */
  const canEdit = useCallback((m: Meeting) =>
    m.organizer === currentUser || role === 'ceo' || role === 'admin',
    [currentUser, role]);

  const updateMeeting = useCallback(async (id: string, patch: MeetingPatch) =>
    guarded(async () => {
      const updated = await api.updateMeeting(id, patch);
      upsertMeeting(updated);
      setConflicts(updated.conflicts ?? []);
      return updated;
    }), [guarded]);

  /* ---------- دستور جلسه ---------- */
  const patchAgenda = (meetingId: string, fn: (list: AgendaItem[]) => AgendaItem[]) =>
    setMeetings((ms) => ms.map((m) => (m.id === meetingId ? { ...m, agenda: fn(m.agenda) } : m)));

  const addAgenda = useCallback(async (meetingId: string, item: { title: string; dur: number }) => {
    await guarded(async () => {
      const created = await api.createAgenda({ meeting: meetingId, ...item });
      patchAgenda(meetingId, (l) => [...l, created]);
    });
  }, [guarded]);

  const updateAgendaItem = useCallback(async (meetingId: string, id: string, item: { title?: string; dur?: number }) => {
    await guarded(async () => {
      const updated = await api.updateAgenda(id, item);
      patchAgenda(meetingId, (l) => l.map((a) => (a.id === id ? updated : a)));
    });
  }, [guarded]);

  const deleteAgendaItem = useCallback(async (meetingId: string, id: string) => {
    await guarded(async () => {
      await api.deleteAgenda(id);
      patchAgenda(meetingId, (l) => l.filter((a) => a.id !== id));
    });
  }, [guarded]);

  const respondMeeting = useCallback(async (id: string, accept: boolean) => {
    await guarded(async () => upsertMeeting(await api.respondMeeting(id, accept)));
  }, [guarded]);

  const syncMeeting = useCallback(async (id: string) => {
    await guarded(async () => upsertMeeting(await api.syncMeeting(id)));
  }, [guarded]);

  /* ---------- صورت‌جلسه ---------- */
  const addMinute = useCallback(async (payload: NewMinute) => {
    await guarded(async () => {
      const entry = await api.createMinute(payload);
      setMinutes((s) => ({ ...s, [payload.meeting]: [entry, ...(s[payload.meeting] ?? [])] }));
    });
  }, [guarded]);

  const deleteMinute = useCallback(async (meetingId: string, id: string) => {
    await guarded(async () => {
      await api.deleteMinute(id);
      setMinutes((s) => ({ ...s, [meetingId]: (s[meetingId] ?? []).filter((x) => x.id !== id) }));
    });
  }, [guarded]);

  const toggleTask = useCallback(async (meetingId: string, id: string) => {
    await guarded(async () => {
      const updated = await api.toggleMinute(id);
      setMinutes((s) => ({ ...s, [meetingId]: (s[meetingId] ?? []).map((x) => (x.id === id ? updated : x)) }));
    });
  }, [guarded]);

  /* ---------- تعریف‌ها ---------- */
  const addPerson = useCallback(async (p: { name: string; role: string; orgId: string; color?: string }) => {
    await guarded(async () => {
      const created = await api.createPerson(p);
      setPeople((s) => ({ ...s, [created.id]: created }));
    });
  }, [guarded]);

  const addRoom = useCallback(async (r: { name: string; cap: string; orgId: string }) => {
    await guarded(async () => {
      const created = await api.createRoom(r);
      setRooms((s) => ({ ...s, [created.id]: created }));
    });
  }, [guarded]);

  const addOrg = useCallback(async (o: { name: string; kind: string }) => {
    await guarded(async () => {
      const created = await api.createOrg(o);
      setOrgs((s) => ({ ...s, [created.id]: created }));
    });
  }, [guarded]);

  /* ---------- تنظیمات ---------- */
  const connectGcal = useCallback(async () => {
    if (gcalConnected) { toast('تقویم Google از قبل متصل است', 'info'); return; }
    toast('در حال اتصال به حساب Google…', 'load');
    await guarded(async () => {
      await api.setGcal(true);
      setGcal(true);
      await reload();               // جلسات همگام‌شده را دوباره می‌خوانیم
      toast('Google Calendar با موفقیت متصل شد', 'ok');
    });
  }, [gcalConnected, guarded, reload, toast]);

  const toggleSms = useCallback(async () => {
    const next = !smsEnabled;
    await guarded(async () => {
      await api.setSms(next);
      setSms(next);
      toast(next ? 'پنل پیامکی متصل شد — اعلان‌ها پیامک می‌شوند' : 'ارسال پیامک غیرفعال شد', next ? 'ok' : 'info');
    });
  }, [smsEnabled, guarded, toast]);

  /* ---------- دسترسی ---------- */
  const visibleMeetings = useMemo(() =>
    role === 'user'
      ? meetings.filter((m) => m.organizer === currentUser || m.parts.includes(currentUser))
      : meetings,
    [meetings, role, currentUser]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme');
    const isDark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    const next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('gp-theme', next); } catch { /* حالت خصوصی مرورگر */ }
  }, []);

  const value = useMemo<Store>(() => ({
    authed, authChecked, needsProfile, me, signIn, completeProfile, signOut,
    ready, error, reload,
    meetings, visibleMeetings, minutes, people, guests, rooms, orgs, orgKinds, categories,
    getMeeting, canEdit, createMeeting, updateMeeting,
    addAgenda, updateAgenda: updateAgendaItem, deleteAgenda: deleteAgendaItem,
    respondMeeting, syncMeeting,
    addMinute, deleteMinute, toggleTask,
    addPerson, addRoom, addOrg,
    role, currentUser, setRole, setCurrentUser,
    gcalConnected, connectGcal, smsEnabled, toggleSms,
    conflicts, dismissConflicts: () => setConflicts([]),
    createOpen, openCreate: () => setCreateOpen(true), closeCreate: () => setCreateOpen(false),
    toast, toggleTheme,
  }), [conflicts, authed, authChecked, needsProfile, me, signIn, completeProfile, signOut,
    ready, error, reload, meetings, visibleMeetings, minutes, people, guests, rooms, orgs, orgKinds, categories,
    getMeeting, canEdit, createMeeting, updateMeeting, addAgenda, updateAgendaItem, deleteAgendaItem,
    respondMeeting, syncMeeting, addMinute, deleteMinute, toggleTask,
    addPerson, addRoom, addOrg, role, currentUser, gcalConnected, connectGcal, smsEnabled, toggleSms,
    createOpen, toast, toggleTheme]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toaster">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.kind === 'load'
              ? <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth={2.4} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              : <IconCheck size={19} />}
            <span>{t.msg}</span>
            <button className="tclose" aria-label="بستن" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><IconX size={15} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
