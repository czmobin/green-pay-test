export type MeetingType = 'board' | 'external' | 'internal' | 'online';
export type MeetingStatus = 'confirmed' | 'pending' | 'cancelled' | 'done';

export interface Person {
  id: string;
  name: string;
  role: string;
  color: string; // "start,end" gradient
  orgId?: string; // سازمان/شرکت (پیش‌فرض گرین‌پی)
}

export interface Guest {
  id: string;
  name: string;
  org: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: 'internal' | 'bank' | 'regulator' | 'partner';
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
}

export interface AgendaItem {
  title: string;
  dur: number; // minutes
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  category: string; // category id
  status: MeetingStatus;
  day: number; // 0..4  (شنبه..چهارشنبه)
  start: number; // hour, e.g. 9 or 13.5
  end: number;
  room: string; // room id
  organizer: string; // person id
  parts: string[]; // person ids
  guests: string[]; // guest ids
  synced: boolean;
  agenda: AgendaItem[];
}

export type MinuteType = 'note' | 'decision' | 'task' | 'reminder' | 'call';

export interface Minute {
  id: string;
  type: MinuteType;
  text: string;
  createdAt: number;
  // task
  assignee?: string;
  due?: string;
  done?: boolean;
  // reminder
  when?: string;
  // call
  who?: string;
  phone?: string;
}
