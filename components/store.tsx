'use client';
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Meeting, Minute, Person, Room, Organization } from '@/lib/types';
import { seedMeetings, seedMinutes, people as seedPeople, rooms as seedRooms, organizations as seedOrgs } from '@/lib/data';
import { IconCheck, IconX } from './Icons';

type ToastKind = 'ok' | 'info' | 'load';
interface Toast { id: number; msg: string; kind: ToastKind }

interface Store {
  meetings: Meeting[];
  addMeeting: (m: Meeting) => void;
  getMeeting: (id: string) => Meeting | undefined;
  syncMeeting: (id: string) => void;

  minutes: Record<string, Minute[]>;
  addMinute: (mid: string, m: Minute) => void;
  deleteMinute: (mid: string, id: string) => void;
  toggleTask: (mid: string, id: string) => void;

  respondMeeting: (id: string, accept: boolean) => void;

  people: Record<string, Person>;
  rooms: Record<string, Room>;
  orgs: Record<string, Organization>;
  addPerson: (p: Person) => void;
  addRoom: (r: Room) => void;
  addOrg: (o: Organization) => void;

  gcalConnected: boolean;
  connectGcal: () => void;

  smsEnabled: boolean;
  toggleSms: () => void;

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

let idc = 1000;
const nextId = () => `x${++idc}`;

export default function Providers({ children }: { children: React.ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>(seedMeetings);
  const [minutes, setMinutes] = useState<Record<string, Minute[]>>(seedMinutes);
  const [people, setPeople] = useState<Record<string, Person>>(seedPeople);
  const [rooms, setRooms] = useState<Record<string, Room>>(seedRooms);
  const [orgs, setOrgs] = useState<Record<string, Organization>>(seedOrgs);
  const [gcalConnected, setGcal] = useState(false);
  const [smsEnabled, setSms] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);

  // hydrate minutes from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('gp-minutes');
      if (raw) setMinutes(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem('gp-minutes', JSON.stringify(minutes)); } catch {}
  }, [minutes, loaded]);

  const toast = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const addMeeting = useCallback((m: Meeting) => setMeetings((ms) => [...ms, m]), []);
  const getMeeting = useCallback((id: string) => meetings.find((m) => m.id === id), [meetings]);
  const syncMeeting = useCallback((id: string) =>
    setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, synced: true } : m))), []);
  const respondMeeting = useCallback((id: string, accept: boolean) =>
    setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, status: accept ? 'confirmed' : 'cancelled' } : m))), []);

  const addMinute = useCallback((mid: string, m: Minute) =>
    setMinutes((s) => ({ ...s, [mid]: [m, ...(s[mid] ?? [])] })), []);
  const deleteMinute = useCallback((mid: string, id: string) =>
    setMinutes((s) => ({ ...s, [mid]: (s[mid] ?? []).filter((x) => x.id !== id) })), []);
  const toggleTask = useCallback((mid: string, id: string) =>
    setMinutes((s) => ({ ...s, [mid]: (s[mid] ?? []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })), []);

  const addPerson = useCallback((p: Person) => setPeople((s) => ({ ...s, [p.id]: p })), []);
  const addRoom = useCallback((r: Room) => setRooms((s) => ({ ...s, [r.id]: r })), []);
  const addOrg = useCallback((o: Organization) => setOrgs((s) => ({ ...s, [o.id]: o })), []);

  const connectGcal = useCallback(() => {
    if (gcalConnected) { toast('تقویم Google از قبل متصل است', 'info'); return; }
    toast('در حال اتصال به حساب Google…', 'load');
    setTimeout(() => { setGcal(true); toast('Google Calendar با موفقیت متصل شد', 'ok'); }, 1300);
  }, [gcalConnected, toast]);

  const toggleSms = useCallback(() => {
    setSms((v) => {
      const next = !v;
      toast(next ? 'پنل پیامکی متصل شد — اعلان‌ها پیامک می‌شوند' : 'ارسال پیامک غیرفعال شد', next ? 'ok' : 'info');
      return next;
    });
  }, [toast]);

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme');
    const isDark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme:dark)').matches;
    const next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('gp-theme', next); } catch {}
  }, []);

  const value = useMemo<Store>(() => ({
    meetings, addMeeting, getMeeting, syncMeeting, respondMeeting,
    minutes, addMinute, deleteMinute, toggleTask,
    people, rooms, orgs, addPerson, addRoom, addOrg,
    gcalConnected, connectGcal,
    smsEnabled, toggleSms,
    createOpen, openCreate: () => setCreateOpen(true), closeCreate: () => setCreateOpen(false),
    toast, toggleTheme,
  }), [meetings, minutes, people, rooms, orgs, gcalConnected, smsEnabled, createOpen, addMeeting, getMeeting, syncMeeting, respondMeeting, addMinute, deleteMinute, toggleTask, addPerson, addRoom, addOrg, connectGcal, toggleSms, toast, toggleTheme]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toaster">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.kind === 'load'
              ? <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth={2.4} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              : <IconCheck size={19} className="" />}
            <span>{t.msg}</span>
            <button className="tclose" aria-label="بستن" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><IconX size={15} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
