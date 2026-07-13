import React from 'react';

type P = { size?: number; className?: string };
const s = (n?: number) => ({ width: n ?? 20, height: n ?? 20 });
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconDashboard = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const IconCalendar = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
);
export const IconList = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
);
export const IconGuests = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 20c0-2.4-1-4.2-2.6-5.2" /></svg>
);
export const IconRoom = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M3 21V8l9-5 9 5v13" /><path d="M3 21h18M9 21v-6h6v6" /></svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
export const IconBell = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
);
export const IconClock = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconBack = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);
export const IconCheck = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconX = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconTrash = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
);
export const IconMapPin = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
);
export const IconVideo = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><rect x="3" y="6" width="12" height="12" rx="2.5" /><path d="M15 10.5 21 7v10l-6-3.5" /></svg>
);
export const IconSun = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></svg>
);
export const IconUsers = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /><path d="M16 5a3 3 0 0 1 0 6" /></svg>
);
export const IconDoc = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M13 3v5h5M8 13h8M8 17h5" /></svg>
);

/* Minute type icons */
export const IconNote = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M5 4h14v12l-5 4H5z" /><path d="M14 20v-4h5M8 9h8M8 13h4" /></svg>
);
export const IconDecision = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" /></svg>
);
export const IconTask = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.2 2.2 4.8-5" /></svg>
);
export const IconReminder = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2.5 5.5 5M15 2.5 18.5 5" /></svg>
);
export const IconCall = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24" {...stroke}><path d="M5 3h3.5l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5V21a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-2Z" /></svg>
);

export const IconGoogle = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24"><path fill="#4285F4" d="M18 3h-1V1.5h-2V3H9V1.5H7V3H6a3 3 0 0 0-3 3v1h18V6a3 3 0 0 0-3-3Z" /><path fill="#34A853" d="M3 8v10a3 3 0 0 0 3 3h5V8Z" /><path fill="#FBBC05" d="M21 8h-8v13h5a3 3 0 0 0 3-3Z" /><path fill="#EA4335" d="M14.5 11.2h-2.1v1.4h1.2c-.1.6-.7 1.1-1.2 1.1-.8 0-1.4-.7-1.4-1.5s.6-1.5 1.4-1.5c.4 0 .7.1.9.4l1-1c-.5-.5-1.1-.7-1.9-.7-1.6 0-2.8 1.3-2.8 2.9s1.2 2.9 2.8 2.9c1.6 0 2.7-1.1 2.7-2.8 0-.3 0-.5-.1-.6Z" /></svg>
);

export const IconLeaf = ({ size, className }: P) => (
  <svg {...s(size)} className={className} viewBox="0 0 24 24"><path d="M12 3C7 3 3.5 6.5 3.5 11.5c0 4.2 3 7.6 7 8.4-.3-1.3-.2-3 .6-4.6 1-2 3-3.4 5.4-4.2-2 .3-3.7 1-5 2.1.8-3 3.1-5 6.5-5.6C16.9 4 14.7 3 12 3Z" fill="#062018" /></svg>
);

export const minuteIcon = (name: string, p?: P) => {
  switch (name) {
    case 'note': return <IconNote {...p} />;
    case 'decision': return <IconDecision {...p} />;
    case 'task': return <IconTask {...p} />;
    case 'reminder': return <IconReminder {...p} />;
    case 'call': return <IconCall {...p} />;
    default: return <IconNote {...p} />;
  }
};
