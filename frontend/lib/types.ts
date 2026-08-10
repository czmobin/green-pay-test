export type Role = 'admin' | 'ceo' | 'user' | 'member';
/** دامنهٔ نمایش جلسات برای مدیرها */
export type Scope = 'mine' | 'all';

export type MeetingType = 'in_person' | 'online';
export type MeetingStatus = 'confirmed' | 'pending' | 'cancelled' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
/** پاسخ یک نفر به دعوت جلسه */
export type InviteResponse = 'accepted' | 'pending' | 'declined';

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
  address?: string;          // نشانی کامل برای نمایش
  lat?: number | null;       // مختصات برای مسیریابی
  lng?: number | null;
  hasMap?: boolean;
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
  cancelReason?: string;
  cancelledAt?: number | null;
  cancelledBy?: string | null;
  date: string; // تاریخ میلادی ISO (YYYY-MM-DD)
  start: number; // hour, e.g. 9 or 13.5
  end: number;
  room: string; // room id
  organizer: string; // person id
  parts: string[]; // person ids
  guests: string[]; // guest ids
  /** پاسخ دعوت هر شرکت‌کننده — کلید: شناسهٔ فرد */
  partStatus?: Record<string, InviteResponse>;
  synced: boolean;
  agenda: AgendaItem[];
}

/** «action» دیگر ساخته نمی‌شود و فقط در دادهٔ قدیمی دیده می‌شود. */
export type MinuteType = 'note' | 'decision' | 'action' | 'reminder' | 'call' | 'letter' | 'file';

export interface Minute {
  id: string;
  type: MinuteType;
  text: string;
  createdAt: number;
  participant?: string; // person id — صورت‌جلسهٔ کدام شرکت‌کننده؛ undefined = عمومی
  fileName?: string; // برای نامه/فایل
  // فقط «اقدام»های قدیمی
  assignee?: string;
  due?: string | null;   // تاریخ ISO مهلت
  done?: boolean;
  doneAt?: number | null;
  // reminder
  when?: string;
  remindDate?: string | null;
  remindHour?: number | null;
  /** بند دستور جلسه‌ای که این آیتم ذیل آن مطرح شد (اختیاری) */
  agendaItem?: string | null;
  editedAt?: number | null;
  // call
  who?: string;
  phone?: string;
}
