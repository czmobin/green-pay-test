'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgendaItem, CalendarShare, Category, Guest, InviteResponse, Meeting, Minute, OrgKind,
  Organization, Person, Role, Room, Scope,
} from '@/lib/types';
import {
  api, loadToken, setTokens, UnauthorizedError,
  type Conflict, type CreatedMeeting, type MeetingPatch, type MeetingReminderHint, type MinutePatch,
  type NewMeeting, type NewMinute, type RoomConflict,
} from '@/lib/api';
import { IconCheck, IconX } from './Icons';

/** نقشِ آمده از API را به نقش داخلی نگاشت می‌کند؛ هر چیز ناشناخته کاربر عادی است. */
const roleOf = (r?: string): Role =>
  (r === 'ceo' || r === 'admin' || r === 'executive') ? r : 'user';

const isManagerRole = (r: Role) => r === 'admin' || r === 'ceo' || r === 'executive';

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
  /** یادآور پیامکیِ خودِ کاربر برای هر جلسه — کارت جلسه از همین می‌خواند */
  reminders: Record<string, MeetingReminderHint>;
  people: Record<string, Person>;
  guests: Record<string, Guest>;
  rooms: Record<string, Room>;
  orgs: Record<string, Organization>;
  orgKinds: Record<string, OrgKind>;
  categories: Record<string, Category>;

  getMeeting: (id: string) => Meeting | undefined;
  canEdit: (m: Meeting) => boolean;
  createMeeting: (m: NewMeeting) => Promise<Meeting | null>;
  updateMeeting: (id: string, patch: MeetingPatch) => Promise<CreatedMeeting | null>;
  addAgenda: (meetingId: string, item: { title: string; dur: number }) => Promise<void>;
  updateAgenda: (meetingId: string, id: string, item: { title?: string; dur?: number }) => Promise<void>;
  deleteAgenda: (meetingId: string, id: string) => Promise<void>;
  respondMeeting: (id: string, accept: boolean) => Promise<void>;
  cancelMeeting: (id: string, reason: string) => Promise<{ smsSent: number; smsFailed: number } | null>;

  addMinute: (m: NewMinute) => Promise<void>;
  deleteMinute: (meetingId: string, id: string) => Promise<void>;
  toggleDone: (meetingId: string, id: string) => Promise<void>;
  updateMinute: (meetingId: string, id: string, patch: MinutePatch) => Promise<void>;

  addPerson: (p: { name: string; role: string; orgId: string; color?: string }) => Promise<void>;
  addRoom: (r: { name: string; cap: string; orgId: string; address?: string; lat?: number | null; lng?: number | null }) => Promise<void>;
  addOrg: (o: { name: string; kind: string }) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  updateRoom: (id: string, patch: { name?: string; cap?: string; address?: string; lat?: number | null; lng?: number | null }) => Promise<Room | null>;
  deleteOrg: (id: string) => Promise<void>;
  /** فقط ادمین و مدیرعامل می‌توانند تعریف‌های دیگران را حذف کنند */
  isManager: boolean;
  /** ادمین اصلی */
  isAdmin: boolean;
  /** پاسخ خودِ کاربر به دعوت این جلسه */
  myResponse: (m: Meeting) => InviteResponse;
  /** جلسه‌هایی که دعوتشان هنوز بی‌پاسخ مانده — به‌ترتیب نزدیک‌ترین */
  myInvites: Meeting[];
  addGuest: (g: { name: string; role?: string; org?: string }) => Promise<Guest | null>;
  importPeople: (file: File) => Promise<{ created: number; skipped: number; messages: string[] } | null>;

  /* دسترسی و تنظیمات */
  role: Role;
  /** دامنهٔ نمایش جلسات — «mine» فقط جلسه‌های خودم، «all» جلسه‌های همه */
  scope: Scope;
  setScope: (s: Scope) => void;
  /** شمار جلسه‌های مدیرعامل — کنار نام تب نشان داده می‌شود. */
  ceoCount: number;
  /** تب «مدیرعامل» فقط برای ادمین، و فقط وقتی مدیرعاملی تعریف شده باشد. */
  canSeeCeoScope: boolean;
  /** تب «همه» فقط برای نقش‌های مدیریتی — گیرندهٔ اشتراک حق دیدن همهٔ سازمان را ندارد. */
  canSeeAllScope: boolean;
  /** تعداد جلسه‌های خودِ کاربر — کنار کلید دامنه نشان داده می‌شود */
  mineCount: number;
  /** تعداد کل جلسه‌های لغونشده */
  liveCount: number;
  /** ادمین و مدیرعامل، به‌علاوهٔ هرکسی که تقویمی با او به اشتراک گذاشته شده */
  canSwitchScope: boolean;

  /* اشتراک تقویم */
  /** تقویم‌هایی که دیگران با من به اشتراک گذاشته‌اند */
  sharedWithMe: CalendarShare[];
  /** کسانی که من تقویمم را با آن‌ها به اشتراک گذاشته‌ام */
  sharedByMe: CalendarShare[];
  /** در دامنهٔ «اشتراکی»، تقویم کدام نفر دیده می‌شود — null یعنی همه */
  sharedOwner: string | null;
  setSharedOwner: (id: string | null) => void;
  /** شمار جلسه‌های تقویم‌های اشتراکی — کنار نام تب */
  sharedCount: number;
  /** اشتراک تقویم با یک یا چند نفر — همه در یک عملیات */
  addShare: (viewers: string[]) => Promise<void>;
  setShareWrite: (id: string, canWrite: boolean) => Promise<void>;
  removeShare: (id: string) => Promise<void>;
  /**
   * آیا می‌توانم در صورت‌جلسهٔ این جلسه بنویسم؟
   * تکرارِ سمت‌کلاینتِ همان قاعدهٔ بک‌اند — فقط برای اینکه رابط از پیش
   * غیرفعال شود، نه به‌عنوان کنترل دسترسی.
   */
  canWriteMinutes: (m: Meeting) => boolean;

  currentUser: string;
  setRole: (r: Role) => void;
  setCurrentUser: (id: string) => void;
  smsEnabled: boolean;
  toggleSms: () => Promise<void>;

  /* هشدار تداخل زمانی — شرکت‌کنندگان و محل (فقط اطلاع‌رسانی) */
  conflicts: Conflict[];
  roomConflicts: RoomConflict[];
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
  const [reminders, setReminders] = useState<Record<string, MeetingReminderHint>>({});
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [guests, setGuests] = useState<Record<string, Guest>>({});
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [orgs, setOrgs] = useState<Record<string, Organization>>({});
  const [orgKinds, setOrgKinds] = useState<Record<string, OrgKind>>({});
  const [categories, setCategories] = useState<Record<string, Category>>({});

  const [role, setRole] = useState<Role>('ceo');
  const [rawScope, setScopeState] = useState<Scope>('mine');
  const scopeTouched = useRef(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [sharedWithMe, setSharedWithMe] = useState<CalendarShare[]>([]);
  const [sharedByMe, setSharedByMe] = useState<CalendarShare[]>([]);
  const [sharedOwner, setSharedOwner] = useState<string | null>(null);
  const [smsEnabled, setSms] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [roomConflicts, setRoomConflicts] = useState<RoomConflict[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  /** ادمین پیش‌فرض همهٔ جلسات را می‌بیند، مدیرعامل پیش‌فرض جلسه‌های خودش را. */
  const applyDefaultScope = useCallback((r: Role) => {
    if (scopeTouched.current) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem('gp-scope'); } catch { /* حالت خصوصی مرورگر */ }
    // «مدیرعامل» فقط برای ادمین معتبر است؛ اگر نقش کاربر عوض شده باشد، مقدارِ
    // مانده در حافظهٔ مرورگر نباید دامنه‌ای را باز کند که دیگر حقش نیست.
    if (saved === 'ceo' && r === 'admin') { setScopeState('ceo'); return; }
    if (saved === 'mine' || saved === 'all') { setScopeState(saved); return; }
    setScopeState(r === 'admin' ? 'all' : 'mine');
  }, []);

  const setScope = useCallback((next: Scope) => {
    scopeTouched.current = true;
    setScopeState(next);
    try { localStorage.setItem('gp-scope', next); } catch { /* حالت خصوصی مرورگر */ }
  }, []);

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
    const r = roleOf(user.accessRole);
    setRole(r);
    applyDefaultScope(r);
    setReady(false);            // داده‌ها با توکن جدید دوباره خوانده می‌شوند
  }, [applyDefaultScope]);

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
    setMeetings([]); setMinutes({}); setReminders({}); setPeople({}); setGuests({});
    setRooms({}); setOrgs({}); setOrgKinds({}); setCategories({});
  }, []);

  /* ---------- بارگذاری اولیه ---------- */
  const reload = useCallback(async () => {
    try {
      const d = await api.bootstrap();
      setMeetings(d.meetings);
      setMinutes(d.minutes);
      setReminders(d.reminders ?? {});
      setPeople(d.people);
      setGuests(d.guests);
      setRooms(d.rooms);
      setOrgs(d.organizations);
      setOrgKinds(d.orgKinds ?? {});
      setCategories(d.categories);
      setSharedWithMe(d.sharedWithMe ?? []);
      setSharedByMe(d.sharedByMe ?? []);
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
        const r = roleOf(user.accessRole);
        setRole(r);
        applyDefaultScope(r);
      })
      .catch(() => { setTokens(null, null); setAuthed(false); })
      .finally(() => setAuthChecked(true));
  }, [applyDefaultScope]);

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
      setRoomConflicts(created.roomConflicts ?? []);
      return created;
    }), [guarded]);

  /**
   * اجازهٔ ویرایش — تکرار دقیق `can_edit_meeting` بک‌اند.
   *
   * جلسهٔ داخلی: سازنده و نقش‌های مدیریتی. جلسهٔ همگام با Outlook: فقط سازنده
   * و ادمین — چون ویرایشِ آن به تقویم و موبایل همه می‌رود. جلسه‌ای که
   * برگزارکننده‌اش بیرونی است: هیچ‌کس.
   *
   * اگر این دو از هم دور بیفتند، رابط دکمهٔ ویرایشی نشان می‌دهد که API ردش
   * می‌کند — بدترین شکل ممکنِ این خطا.
   */
  const canEdit = useCallback((m: Meeting) => {
    if (m.outlookReadonly) return false;
    if (m.outlookSynced) return m.organizer === currentUser || role === 'admin';
    return m.organizer === currentUser || isManagerRole(role);
  }, [currentUser, role]);

  const updateMeeting = useCallback(async (id: string, patch: MeetingPatch) =>
    guarded(async () => {
      const updated = await api.updateMeeting(id, patch);
      upsertMeeting(updated);
      setConflicts(updated.conflicts ?? []);
      setRoomConflicts(updated.roomConflicts ?? []);
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

  const cancelMeeting = useCallback(async (id: string, reason: string) => {
    let out: { smsSent: number; smsFailed: number } | null = null;
    await guarded(async () => {
      const m = await api.cancelMeeting(id, reason);
      upsertMeeting(m);
      out = { smsSent: m.smsSent, smsFailed: m.smsFailed };
    });
    return out;
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

  const toggleDone = useCallback(async (meetingId: string, id: string) => {
    await guarded(async () => {
      const updated = await api.toggleMinute(id);
      setMinutes((s) => ({ ...s, [meetingId]: (s[meetingId] ?? []).map((x) => (x.id === id ? updated : x)) }));
    });
  }, [guarded]);

  const updateMinute = useCallback(async (meetingId: string, id: string, patch: MinutePatch) => {
    await guarded(async () => {
      const updated = await api.updateMinute(id, patch);
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

  const addRoom = useCallback(async (r: { name: string; cap: string; orgId: string; address?: string; lat?: number | null; lng?: number | null }) => {
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

  const dropFrom = <T,>(map: Record<string, T>, id: string) => {
    const next = { ...map };
    delete next[id];
    return next;
  };

  const deletePerson = useCallback(async (id: string) => {
    await guarded(async () => { await api.deletePerson(id); setPeople((s) => dropFrom(s, id)); });
  }, [guarded]);
  const deleteRoom = useCallback(async (id: string) => {
    await guarded(async () => { await api.deleteRoom(id); setRooms((s) => dropFrom(s, id)); });
  }, [guarded]);
  const deleteOrg = useCallback(async (id: string) => {
    await guarded(async () => { await api.deleteOrg(id); setOrgs((s) => dropFrom(s, id)); });
  }, [guarded]);

  /* ---------- اشتراک تقویم ---------- */
  const addShare = useCallback(async (viewers: string[]) => {
    if (!viewers.length) return;
    await guarded(async () => {
      // پشت‌سرهم و نه موازی: تعدادشان انگشت‌شمار است و اگر یکی رد شود،
      // بقیه‌ای که رفته‌اند سرِ جایشان می‌مانند.
      const made: CalendarShare[] = [];
      for (const viewer of viewers) made.push(await api.createShare(viewer));
      setSharedByMe((s) => {
        const ids = new Set(made.map((x) => x.id));
        return [...s.filter((x) => !ids.has(x.id)), ...made];
      });
      toast(made.length === 1
        ? 'تقویم شما با این نفر به اشتراک گذاشته شد'
        : `تقویم شما با ${made.length} نفر به اشتراک گذاشته شد`, 'ok');
    });
  }, [guarded, toast]);

  const setShareWrite = useCallback(async (id: string, canWrite: boolean) => {
    await guarded(async () => {
      const share = await api.setShareWrite(id, canWrite);
      setSharedByMe((s) => s.map((x) => (x.id === id ? share : x)));
      toast(canWrite ? 'اجازهٔ نوشتن صورت‌جلسه روشن شد' : 'اجازهٔ نوشتن صورت‌جلسه خاموش شد', 'ok');
    });
  }, [guarded, toast]);

  const removeShare = useCallback(async (id: string) => {
    await guarded(async () => {
      await api.deleteShare(id);
      setSharedByMe((s) => s.filter((x) => x.id !== id));
      setSharedWithMe((s) => s.filter((x) => x.id !== id));
      // تقویمی که برداشته شد نباید انتخاب بماند وگرنه تب خالی می‌ماند.
      setSharedOwner(null);
      // جلسه‌های آن تقویم دیگر نباید دیده شوند؛ فهرست از سرور تازه می‌شود.
      await reload();
      toast('اشتراک برداشته شد', 'ok');
    });
  }, [guarded, reload, toast]);

  /* ---------- تنظیمات ---------- */
  const toggleSms = useCallback(async () => {
    const next = !smsEnabled;
    await guarded(async () => {
      await api.setSms(next);
      setSms(next);
      toast(next ? 'پنل پیامکی متصل شد — اعلان‌ها پیامک می‌شوند' : 'ارسال پیامک غیرفعال شد', next ? 'ok' : 'info');
    });
  }, [smsEnabled, guarded, toast]);

  const updateRoom = useCallback(async (
    id: string,
    patch: { name?: string; cap?: string; address?: string; lat?: number | null; lng?: number | null },
  ) => {
    let out: Room | null = null;
    await guarded(async () => {
      out = await api.updateRoom(id, patch);
      setRooms((s) => ({ ...s, [id]: out as Room }));
    });
    return out;
  }, [guarded]);

  const addGuest = useCallback(async (g: { name: string; role?: string; org?: string }) => {
    let out: Guest | null = null;
    await guarded(async () => {
      out = await api.createGuest(g);
      setGuests((s) => ({ ...s, [(out as Guest).id]: out as Guest }));
    });
    return out;
  }, [guarded]);

  const importPeople = useCallback(async (file: File) => {
    let out: { created: number; skipped: number; messages: string[] } | null = null;
    await guarded(async () => {
      const res = await api.importPeople(file);
      setPeople((s) => ({ ...s, ...res.people }));
      out = { created: res.created, skipped: res.skipped, messages: res.messages };
    });
    return out;
  }, [guarded]);

  /* ---------- دسترسی ---------- */
  // مدیر اجرایی هم مدیر است: دامنهٔ دیدش فراتر از جلسه‌های خودش است و
  // تعریف‌ها را می‌تواند بچیند. تفاوتش با مدیرعامل را بک‌اند اعمال می‌کند —
  // جلسه‌های مدیرعامل برایش فرستاده نمی‌شود.
  const isManager = role === 'admin' || role === 'ceo' || role === 'executive';
  // «جلسه‌های من» یعنی جلسه‌هایی که در آن‌ها شرکت دارم — نه جلسه‌ای که فقط ساخته‌ام
  // و خودم در آن نیستم (مثلاً جلسه‌ای که برای دیگران تنظیم کرده‌ام).
  const mine = useCallback((m: Meeting) => m.parts.includes(currentUser), [currentUser]);

  /**
   * شناسهٔ افرادی که سطح دسترسی‌شان مدیرعامل است.
   *
   * مجموعه است نه یک شناسهٔ تکی: سازمان امروز یک مدیرعامل دارد، ولی اگر فردا
   * دو نفر شدند این تب باید هر دو را نشان دهد نه اینکه بی‌صدا یکی را بیندازد.
   */
  const ceoIds = useMemo(
    () => Object.values(people).filter((p) => p.accessRole === 'ceo').map((p) => p.id),
    [people]);

  /** جلسه‌ای که دست‌کم یک مدیرعامل در آن شرکت دارد. */
  const isCeoMeeting = useCallback(
    (m: Meeting) => ceoIds.some((id) => m.parts.includes(id)),
    [ceoIds]);

  /**
   * شناسهٔ مبدأهایی که تقویمشان الان دیده می‌شود — همه، یا فقط انتخاب‌شده.
   *
   * اگر مبدأ انتخاب‌شده دیگر در فهرست نباشد (اشتراک پس گرفته شده)، فهرست خالی
   * می‌شود نه اینکه بی‌صدا به «همه» برگردد؛ تب خالی از تبِ اشتباه بهتر است.
   */
  /**
   * دامنهٔ مؤثر — اگر آخرین اشتراک برداشته شود، «اشتراکی» دیگر معنا ندارد و
   * کاربر نباید روی تبی گیر کند که نه دیده می‌شود نه چیزی نشان می‌دهد.
   */
  const scope: Scope = (rawScope === 'shared' && sharedWithMe.length === 0) ? 'mine' : rawScope;

  const sharedOwnerIds = useMemo(() => {
    const all = sharedWithMe.map((s) => s.owner);
    return sharedOwner === null ? all : all.filter((id) => id === sharedOwner);
  }, [sharedWithMe, sharedOwner]);

  /** جلسه‌ای که روی تقویم یکی از این مبدأهاست — سازنده یا شرکت‌کننده. */
  const onSharedCalendar = useCallback(
    (m: Meeting, owners: string[]) =>
      owners.some((id) => m.organizer === id || m.parts.includes(id)),
    []);

  /**
   * اجازهٔ نوشتن صورت‌جلسه — تکرار دقیق قاعدهٔ `can_write_minutes` بک‌اند.
   *
   * اینجا فقط برای این است که ویرایشگر از پیش غیرفعال شود؛ کنترل واقعی سمت
   * سرور است. اگر این دو از هم دور بیفتند، بدترین حالت یک ۴۰۳ ناغافل است.
   */
  const canWriteMinutes = useCallback((m: Meeting) => {
    if (m.organizer === currentUser || isManagerRole(role)) return true;
    if (m.parts.includes(currentUser)) return true;
    return sharedWithMe.some((s) => s.canWriteMinutes
      && (m.organizer === s.owner || m.parts.includes(s.owner)));
  }, [currentUser, role, sharedWithMe]);

  const liveCount = useMemo(() => meetings.filter((m) => m.status !== 'cancelled').length, [meetings]);

  const mineCount = useMemo(
    () => meetings.filter((m) => m.status !== 'cancelled' && mine(m)).length,
    [meetings, mine]);

  const ceoCount = useMemo(
    () => meetings.filter((m) => m.status !== 'cancelled' && isCeoMeeting(m)).length,
    [meetings, isCeoMeeting]);

  const sharedCount = useMemo(
    () => meetings.filter((m) => m.status !== 'cancelled'
      && onSharedCalendar(m, sharedOwnerIds)).length,
    [meetings, onSharedCalendar, sharedOwnerIds]);

  /**
   * فهرست‌های اپ (داشبورد، جلسات، تقویم) جلسهٔ لغوشده را نشان نمی‌دهند؛
   * صفحهٔ خودِ جلسه از store.getMeeting می‌آید و همچنان باز می‌شود تا لینک‌های
   * قدیمی و پیامک لغو به بن‌بست نخورند.
   */
  const visibleMeetings = useMemo(() => {
    const live = meetings.filter((m) => m.status !== 'cancelled');
    // دامنهٔ اشتراکی پیش از شرط «مدیر است یا نه» می‌آید: کاربر عادی هم می‌تواند
    // گیرندهٔ اشتراک باشد و بدون این، جلسه‌های اشتراکی بی‌صدا دور ریخته می‌شدند.
    if (scope === 'shared') {
      return sharedOwnerIds.length ? live.filter((m) => onSharedCalendar(m, sharedOwnerIds)) : [];
    }
    if (!isManager || scope === 'mine') return live.filter(mine);
    // دامنهٔ مدیرعامل فقط دستِ ادمین است؛ شرطِ نقش اینجا هم تکرار می‌شود تا
    // اگر روزی جای دیگری scope را ست کرد، داده از مرزش بیرون نزند.
    if (scope === 'ceo') return role === 'admin' ? live.filter(isCeoMeeting) : live.filter(mine);
    return live;
  }, [meetings, isManager, role, scope, mine, isCeoMeeting, sharedOwnerIds, onSharedCalendar]);

  /**
   * پاسخ خودِ کاربر به دعوت — پیش‌تر «در انتظار» روی وضعیت کل جلسه بود، یعنی
   * پاسخ یک نفر برای همه تصمیم می‌گرفت. حالا هر کس سطر خودش را دارد.
   */
  const myResponse = useCallback(
    (m: Meeting): InviteResponse => m.partStatus?.[currentUser] ?? 'accepted',
    [currentUser]);

  const myInvites = useMemo(
    () => meetings
      .filter((m) => m.status !== 'cancelled' && mine(m) && myResponse(m) === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [meetings, mine, myResponse]);

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
    meetings, visibleMeetings, minutes, reminders, people, guests, rooms, orgs, orgKinds, categories,
    getMeeting, canEdit, createMeeting, updateMeeting,
    addAgenda, updateAgenda: updateAgendaItem, deleteAgenda: deleteAgendaItem,
    respondMeeting, cancelMeeting,
    addMinute, deleteMinute, toggleDone, updateMinute,
    addPerson, addRoom, addOrg,
    deletePerson, deleteRoom, deleteOrg, updateRoom,
    isManager,
    isAdmin: role === 'admin',
    myResponse, myInvites,
    addGuest, importPeople,
    role, scope, setScope, mineCount, liveCount, ceoCount,
    canSwitchScope: isManager || sharedWithMe.length > 0,
    canSeeAllScope: isManager,
    canSeeCeoScope: role === 'admin' && ceoIds.length > 0,
    sharedWithMe, sharedByMe, sharedOwner, setSharedOwner, sharedCount,
    addShare, setShareWrite, removeShare, canWriteMinutes,
    currentUser, setRole, setCurrentUser,
    smsEnabled, toggleSms,
    conflicts, roomConflicts,
    dismissConflicts: () => { setConflicts([]); setRoomConflicts([]); },
    createOpen, openCreate: () => setCreateOpen(true), closeCreate: () => setCreateOpen(false),
    toast, toggleTheme,
  }), [conflicts, roomConflicts, authed, authChecked, needsProfile, me, signIn, completeProfile, signOut,
    ready, error, reload, meetings, visibleMeetings, minutes, reminders, people, guests, rooms, orgs, orgKinds, categories,
    getMeeting, canEdit, createMeeting, updateMeeting, addAgenda, updateAgendaItem, deleteAgendaItem,
    respondMeeting, cancelMeeting, addMinute, deleteMinute, toggleDone, updateMinute,
    addPerson, addGuest, importPeople, addRoom, addOrg, deletePerson, deleteRoom, deleteOrg, updateRoom, role, isManager, myResponse, myInvites, scope, setScope, mineCount, liveCount, ceoCount, ceoIds,
    sharedWithMe, sharedByMe, sharedOwner, sharedCount, addShare, setShareWrite, removeShare, canWriteMinutes,
    currentUser, smsEnabled, toggleSms,
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
