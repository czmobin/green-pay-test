"""
نگاشت بین رویداد Graph و جلسهٔ ما — توابع خالص، بدون I/O و بدون دیتابیس.

جدا نگه‌داشتنشان عمدی است: پرخطاترین بخش این فیچر همین‌جاست (زمان، تکرارشونده،
تمام‌روز، محل)، و اینجا بدون tenant و بدون دیتابیس تست می‌شود.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone


# ------------------------------------------------------------------ زمان

def parse_graph_dt(value: dict | None) -> datetime | None:
    """
    `dateTime`/`timeZone` گراف → datetime آگاه از منطقهٔ زمانی.

    دو تلهٔ واقعی:

    • گراف کسرِ ثانیه را با ۷ رقم می‌دهد (`.0000000`) و `datetime.fromisoformat`
      پایتون ۳٫۱۰ فقط ۳ یا ۶ رقم را می‌پذیرد — بدون کوتاه‌کردن، هر رویداد
      استثنا می‌دهد.
    • ما همیشه بدون هدر `Prefer: outlook.timezone` می‌خوانیم، پس مقدار UTC است
      حتی وقتی `timeZone` چیز دیگری بگوید؛ اگر روزی هدر اضافه شود، همین‌جا
      باید عوض شود و نه ده جای دیگر.
    """
    if not value:
        return None
    raw = (value.get('dateTime') or '').strip()
    if not raw:
        return None
    raw = re.sub(r'(\.\d{6})\d+', r'\1', raw)          # ۷ رقم → ۶ رقم
    raw = raw.replace('Z', '+00:00')
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        # بدون هدر Prefer، گراف همیشه UTC می‌دهد و مقدار naive است.
        dt = dt.replace(tzinfo=dt_timezone.utc)
    return dt


def to_graph_dt(dt: datetime) -> dict:
    """
    datetime ما → `dateTime`/`timeZone` گراف، همیشه در وقت تهران.

    نیتِ کاربر «ساعت دیواری» است: جلسهٔ ۱۰ صبح باید در تقویم همه ۱۰ صبح تهران
    دیده شود. فرستادن UTC هم درست است ولی در رابط Outlook با تغییر ساعت رسمی
    گیج‌کننده می‌شود.
    """
    local = timezone.localtime(dt)
    return {'dateTime': local.strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'Asia/Tehran'}


def graph_window(now=None) -> tuple[str, str]:
    """بازهٔ ثابت calendarView به شکلی که Graph می‌خواهد (UTC، بدون منطقه)."""
    from django.conf import settings
    now = now or timezone.now()
    start = now - timedelta(days=settings.OUTLOOK_WINDOW_PAST_DAYS)
    end = now + timedelta(days=settings.OUTLOOK_WINDOW_FUTURE_DAYS)
    fmt = '%Y-%m-%dT%H:%M:%SZ'
    return start.astimezone(dt_timezone.utc).strftime(fmt), end.astimezone(dt_timezone.utc).strftime(fmt)


# ------------------------------------------------------------------ شناسه

def outlook_uid(event: dict) -> str:
    """
    شناسهٔ یکتای این رویداد نزد ما.

    برای رویداد ساده همان `iCalUId` است. برای occurrence یک سری تکرارشونده،
    `iCalUId` **بین همهٔ occurrenceها مشترک است** — پس بدون افزودن
    `originalStart`، قید یکتا کل یک سری را در یک جلسه جمع می‌کند. این
    ساده‌ترین باگی است که اینجا می‌شود فرستاد.
    """
    uid = (event.get('iCalUId') or '').strip()
    if not uid:
        return ''
    if event.get('type') in ('occurrence', 'exception'):
        stamp = (event.get('originalStart')
                 or (event.get('start') or {}).get('dateTime') or '')
        if stamp:
            return f'{uid}|{stamp}'
    return uid


def is_series_master(event: dict) -> bool:
    """
    سرمجموعهٔ سری تکرارشونده — نادیده گرفته می‌شود.

    `calendarView/delta` خودش سری را به occurrenceهای واقعی باز می‌کند، پس
    وارد کردن سرمجموعه یعنی یک جلسهٔ اضافیِ تکراری در تاریخِ اولین رخداد.
    """
    return event.get('type') == 'seriesMaster'


def is_all_day(event: dict) -> bool:
    return bool(event.get('isAllDay'))


def is_cancelled(event: dict) -> bool:
    """
    لغو، فقط از روی نشانهٔ صریح.

    «در پاسخ نبود» هرگز به معنی حذف گرفته نمی‌شود: صفحه‌بندی ناقص، نشانهٔ
    منقضی و بازهٔ عوض‌شده همگی باعث نبودنِ رویداد می‌شوند بدون اینکه چیزی
    حذف شده باشد.
    """
    return bool(event.get('isCancelled'))


def is_removed(event: dict) -> bool:
    return '@removed' in event


# ------------------------------------------------------------------ محل

def normalize_location(name: str) -> str:
    """برای مقایسه: فاصله‌های تکراری، نیم‌فاصله و حروف بزرگ/کوچک یکسان می‌شوند."""
    s = (name or '').replace('‌', ' ').strip().lower()
    return re.sub(r'\s+', ' ', s)


def match_location(event: dict, locations: dict[str, int]) -> tuple[int | None, str]:
    """
    محل رویداد → (`location_id`، `location_text`).

    اگر متن با یکی از محل‌های تعریف‌شده جور شد، همان انتخاب می‌شود؛ وگرنه متن
    خام در `location_text` می‌ماند. `Location` تازه ساخته **نمی‌شود** — نگاه
    کنید به توضیح `Meeting.location_text`.

    `locations`: نگاشتِ نامِ نرمال‌شده → شناسه.
    """
    raw = ((event.get('location') or {}).get('displayName') or '').strip()
    if not raw:
        return None, ''
    key = normalize_location(raw)
    if key in locations:
        return locations[key], ''
    return None, raw[:255]


# ------------------------------------------------------------------ لینک آنلاین

_URL = re.compile(r'https?://[^\s"\'<>]+')


def extract_meet_link(event: dict) -> str:
    """
    لینک جلسهٔ آنلاین — اول فیلد رسمی، بعد اولین نشانی داخل بدنه.

    بدنه HTML است؛ برای پیدا کردن یک نشانی نیازی به تجزیهٔ HTML نیست و
    اضافه‌کردن یک وابستگی برای این کار به‌صرفه نیست.
    """
    url = ((event.get('onlineMeeting') or {}).get('joinUrl') or '').strip()
    if url:
        return url[:500]
    body = ((event.get('body') or {}).get('content') or '')
    found = _URL.search(body)
    return found.group(0)[:500] if found else ''


def build_body(meeting, agenda_titles: list[str]) -> dict:
    """
    بدنهٔ رویداد — لینک جلسه و دستور جلسه، به‌صورت HTML ساده.

    لینک عمداً داخل بدنه می‌رود و `isOnlineMeeting: true` فرستاده نمی‌شود:
    آن پرچم Teams را وادار می‌کند لینک *خودش* را بسازد، که با `meet_link`
    ثبت‌شدهٔ کاربر (اسکای‌روم، Zoom، هرچه) می‌جنگد.
    """
    parts = []
    if meeting.meet_link:
        parts.append(f'<p>لینک جلسهٔ آنلاین: <a href="{_esc(meeting.meet_link)}">'
                     f'{_esc(meeting.meet_link)}</a></p>')
    if agenda_titles:
        items = ''.join(f'<li>{_esc(t)}</li>' for t in agenda_titles)
        parts.append(f'<p>دستور جلسه:</p><ol>{items}</ol>')
    parts.append('<p><small>ثبت‌شده در سامانهٔ جلسات گرین‌پی</small></p>')
    return {'contentType': 'HTML', 'content': ''.join(parts)}


def _esc(s: str) -> str:
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


# ------------------------------------------------------------------ شرکت‌کنندگان

def attendee_emails(event: dict) -> list[tuple[str, str, str]]:
    """(نشانی، نام نمایشی، پاسخ) برای هر شرکت‌کننده — نشانی‌ها کوچک‌حرف."""
    out = []
    for a in event.get('attendees') or []:
        addr = ((a.get('emailAddress') or {}).get('address') or '').strip().lower()
        if not addr:
            continue
        name = ((a.get('emailAddress') or {}).get('name') or '').strip()
        response = ((a.get('status') or {}).get('response') or '').strip()
        out.append((addr, name, response))
    return out


def organizer_email(event: dict) -> str:
    return (((event.get('organizer') or {}).get('emailAddress') or {})
            .get('address') or '').strip().lower()


RESPONSE_MAP = {
    'accepted': 'accepted',
    'organizer': 'accepted',
    'tentativelyAccepted': 'accepted',
    'declined': 'declined',
    'notResponded': 'pending',
    'none': 'pending',
    '': 'pending',
}


def map_response(graph_response: str) -> str:
    """پاسخ دعوت گراف → پاسخ ما. «مشروط» را پذیرفته می‌گیریم؛ ما حالت سومی نداریم."""
    return RESPONSE_MAP.get(graph_response, 'pending')


# ------------------------------------------------------------------ ساخت payload

def event_payload(meeting, attendee_emails_list: list[str], agenda_titles: list[str]) -> dict:
    """جلسهٔ ما → بدنهٔ ساخت/ویرایش رویداد در Graph."""
    return {
        'subject': meeting.title[:255],
        'start': to_graph_dt(meeting.start),
        'end': to_graph_dt(meeting.end),
        'body': build_body(meeting, agenda_titles),
        'location': {'displayName': _location_name(meeting)},
        'attendees': [
            {'emailAddress': {'address': e}, 'type': 'required'}
            for e in attendee_emails_list
        ],
        'importance': 'high' if meeting.priority in ('high', 'critical') else 'normal',
        # مهرِ «این را ما نوشتیم». تشخیص اکو به این تکیه نمی‌کند (چون
        # calendarView/delta نه $select می‌پذیرد نه $expand، پس این مهر اصلاً در
        # پاسخِ واکشی نمی‌آید و به نسخهٔ شرکت‌کننده‌ها هم منتقل نمی‌شود). فقط
        # برای تعمیر است: اگر ردیف همبستگی گم شود، از روی همین می‌شود جلسهٔ ما
        # را بازشناخت به‌جای اینکه نسخهٔ دومی ساخته شود.
        'singleValueExtendedProperties': [{
            'id': 'String {66f5a359-4659-4830-9070-00047ec6ac6e} Name greenpayMeetingId',
            'value': str(meeting.pk),
        }],
    }


def _location_name(meeting) -> str:
    if meeting.location_id and meeting.location:
        return meeting.location.name
    return meeting.location_text or ''


def extended_meeting_id(event: dict) -> str:
    """شناسهٔ جلسهٔ ما از مهرِ extended property — فقط در مسیر تعمیر خوانده می‌شود."""
    for prop in event.get('singleValueExtendedProperties') or []:
        if 'greenpayMeetingId' in (prop.get('id') or ''):
            return (prop.get('value') or '').strip()
    return ''
