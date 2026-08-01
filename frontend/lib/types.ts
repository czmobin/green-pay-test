export type Role = 'admin' | 'ceo' | 'user' | 'member';
/** دامنهٔ نمایش جلسات برای مدیرها */
export type Scope = 'mine' | 'all';

export type MeetingType = 'in_person' | 'online';
export type MeetingStatus = 'confirmed' | 'pending' | 'cancelled' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface Person {
  id: string;
  name: string;
  role: string; // سمت شغلی
  color: string; // "start,end" gradient
  orgId?: string | null; // سازمان/شرکت
  accessRole?: Role; // سطح دسترسی (admin/ceo/member)
}

export interface Guest {
  id: string;
  name: string;
  org: string;
  role: string;
}

export interface OrgKind {
  id: string;
  slug: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: string | null;   // شناسهٔ نوع سازمان
  kindName?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Room {
  id: string;
  name: string;
  cap: string;
  orgId: string; // سازمان صاحب محل
  is_online?: boolean;
}

export interface AgendaItem {
  id: string;
  title: string;
  dur: number; // دقیقه
  order?: number;
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  category: string; // category id
  status: MeetingStatus;
  priority: Priority;
  meetLink?: string;
  date: string; // تاریخ میلادی ISO (YYYY-MM-DD)
  start: number; // hour, e.g. 9 or 13.5
  end: number;
  room: string; // room id
  organizer: string; // person id
  parts: string[]; // person ids
  guests: string[]; // guest ids
  synced: boolean;
  agenda: AgendaItem[];
}

export type MinuteType = 'note' | 'decision' | 'task' | 'reminder' | 'call' | 'letter' | 'file';

export interface Minute {
  id: string;
  type: MinuteType;
  text: string;
  createdAt: number;
  participant?: string; // person id — صورت‌جلسهٔ کدام شرکت‌کننده؛ undefined = عمومی
  fileName?: string; // برای نامه/فایل
  // task
  assignee?: string;
  due?: string | null;   // تاریخ ISO مهلت
  done?: boolean;
  doneAt?: number | null;
  // reminder
  when?: string;
  remindDate?: string | null;
  remindHour?: number | null;
  // call
  who?: string;
  phone?: string;
}
