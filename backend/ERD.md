# ERD — بک‌اند مدیریت جلسات گرین‌پی

نمودار موجودیت‑رابطه (ERD) برای مدل‌های Django در `meetings/models.py`.

**تصاویر آماده:** [`erd.png`](./erd.png) · [`erd.svg`](./erd.svg)

![ERD](./erd.png)

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "اعضا"
    ORGANIZATION ||--o{ LOCATION : "محل‌ها"
    CATEGORY    ||--o{ MEETING : "دسته"
    LOCATION    ||--o{ MEETING : "محل"
    USER        ||--o{ MEETING : "برگزارکننده"
    MEETING     ||--o{ MEETING_PARTICIPANT : "شرکت‌کنندگان"
    USER        ||--o{ MEETING_PARTICIPANT : "حضور"
    MEETING     ||--o{ AGENDA_ITEM : "دستور جلسه"
    MEETING     ||--o{ MINUTES : "صورت‌جلسه‌ها"
    USER        ||--o{ MINUTES : "صورت‌جلسهٔ شرکت‌کننده"
    MINUTES     ||--o{ MINUTE_ENTRY : "آیتم‌ها"
    USER        ||--o{ MINUTE_ENTRY : "مسئول تسک"
    MINUTES     ||--o{ ATTACHMENT : "پیوست‌ها"
    MINUTE_ENTRY ||--o{ ATTACHMENT : "پیوست آیتم"
    USER        ||--o{ NOTIFICATION : "اعلان‌ها"
    MEETING     ||--o{ NOTIFICATION : "مرتبط"
    USER        ||--|| GOOGLE_CALENDAR : "اتصال"

    ORGANIZATION {
        int id PK
        string name
        string kind "internal|bank|regulator|partner"
    }
    USER {
        int id PK
        string username
        string full_name
        string role "admin|ceo|member"
        int organization_id FK
        string title
        string phone
        bool is_external
        bool sms_enabled
    }
    LOCATION {
        int id PK
        string name
        string capacity
        int organization_id FK
        bool is_online
    }
    CATEGORY {
        int id PK
        string name
        string color
    }
    MEETING {
        int id PK
        string title
        int category_id FK
        string meeting_type "board|external|internal|online"
        string status "confirmed|pending|cancelled|done"
        int location_id FK
        int organizer_id FK
        datetime start
        datetime end
        bool google_synced
        string google_event_id
    }
    MEETING_PARTICIPANT {
        int id PK
        int meeting_id FK
        int user_id FK
        bool is_guest
        string response "accepted|pending|declined"
    }
    AGENDA_ITEM {
        int id PK
        int meeting_id FK
        int order
        string title
        int duration_minutes
    }
    MINUTES {
        int id PK
        int meeting_id FK
        int participant_id FK "NULL = عمومی"
        int created_by_id FK
    }
    MINUTE_ENTRY {
        int id PK
        int minutes_id FK
        string entry_type "note|decision|task|reminder|call|letter|file"
        text text
        int assignee_id FK
        date due_date
        bool is_done
        datetime remind_at
        string call_with
        string call_phone
    }
    ATTACHMENT {
        int id PK
        int minutes_id FK
        int entry_id FK
        string kind "letter|file"
        file file
        string name
    }
    NOTIFICATION {
        int id PK
        int user_id FK
        string kind "meeting|invite|task|reminder"
        string title
        int meeting_id FK
        int entry_id FK
        datetime remind_at
        bool delivered_in_app
        bool delivered_sms
        bool is_read
    }
    GOOGLE_CALENDAR {
        int id PK
        int user_id FK
        bool is_connected
        string calendar_id
        datetime synced_at
    }
```

## توضیح موجودیت‌ها

| موجودیت | نقش | نکات کلیدی |
|---|---|---|
| **Organization** | سازمان/شرکت | داخلی، بانک، رگولاتور، شریک |
| **User** | فرد (کارمند یا مهمان) | `role` سطح دسترسی؛ `is_external` مهمان خارجی؛ متصل به سازمان |
| **Location** | محل جلسه | متصل به سازمان؛ `is_online` برای Google Meet |
| **Category** | دستهٔ جلسه | فیلتر جلسات (هیئت مدیره، بانکی، …) |
| **Meeting** | جلسه | دسته، محل، برگزارکننده، بازهٔ زمانی، وضعیت همگام‌سازی گوگل |
| **MeetingParticipant** | جدول واسط | شرکت‌کننده/مهمان + پاسخ دعوت (accepted/pending/declined) |
| **AgendaItem** | دستور جلسه | فهرست موضوعات به‌ترتیب با مدت |
| **Minutes** | صورت‌جلسه | **یکتا به‌ازای (جلسه، شرکت‌کننده)**؛ `participant=NULL` یعنی عمومی |
| **MinuteEntry** | آیتم صورت‌جلسه | یادداشت/تصمیم/تسک/یادآور/تماس/نامه/فایل؛ فیلدهای تسک و یادآور و تماس |
| **Attachment** | پیوست | نامه/فایل متصل به صورت‌جلسه (و به‌صورت اختیاری یک آیتم) |
| **Notification** | اعلان | یادآور ۳۰ دقیقه قبل؛ `delivered_in_app` و `delivered_sms` |
| **GoogleCalendarConnection** | اتصال گوگل | `calendar_id` برای کلندر موازی |

## نگاشت به فرانت‌اند
- «تعریف‌ها» → `Organization` / `User` / `Location`
- «دسته‌بندی جلسه» → `Category`
- «دعوت‌نامه‌ها» و پاسخ آن‌ها → `MeetingParticipant.response`
- «دستور جلسه» → `AgendaItem`
- «صورت‌جلسهٔ به‌ازای هر شرکت‌کننده» → `Minutes` (participant) + `MinuteEntry` + `Attachment`
- «یادآورها/تسک‌ها» → `MinuteEntry` با `entry_type in (task, reminder)`
- «اعلان + پیامک ۳۰ دقیقه قبل» → `Notification`
- «سطوح دسترسی» → `User.role`
- «اتصال Google Calendar (کلندر موازی)» → `GoogleCalendarConnection`
