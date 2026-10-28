"""ویوهای API — یک endpoint راه‌انداز (bootstrap) به‌علاوهٔ عملیات نوشتن."""
import logging
from django.db.models import Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from django.utils import timezone
from django.utils.dateparse import parse_date
from django.conf import settings
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import (
    AgendaItem, CalendarShare, Category, Location, Meeting, MeetingParticipant,
    MeetingReminder, MinuteEntry, Organization, OrganizationKind, User,
)
from .serializers import (
    AgendaItemSerializer, CalendarShareCreateSerializer, CalendarShareSerializer,
    CategorySerializer, GuestSerializer, LocationCreateSerializer,
    LocationSerializer, MeetingCreateSerializer, MeetingSerializer, MinuteEntryCreateSerializer,
    MinuteEntrySerializer, OrganizationCreateSerializer, OrganizationKindSerializer,
    OrganizationSerializer, PersonCreateSerializer, PersonSerializer, from_date_hour,
)

logger = logging.getLogger(__name__)


def is_admin(user) -> bool:
    """ادمین اصلی — تنها کسی که هیچ جلسه‌ای از او پنهان نیست."""
    return getattr(user, 'role', None) == User.Role.ADMIN or getattr(user, 'is_superuser', False)


def is_manager(user) -> bool:
    """
    نقش‌های مدیریتی: ادمین، مدیرعامل و مدیر اجرایی.

    هر سه دامنهٔ دیدشان فراتر از جلسه‌های خودشان است و اجازهٔ ویرایش تعریف‌ها
    را دارند؛ تفاوتشان فقط در جلسه‌های مدیرعامل است — نگاه کنید به
    `meetings_queryset`.
    """
    return (getattr(user, 'role', None)
            in (User.Role.ADMIN, User.Role.CEO, User.Role.EXECUTIVE)
            or getattr(user, 'is_superuser', False))


def can_edit_meeting(user, meeting) -> bool:
    """
    چه کسی می‌تواند جلسه و دستور جلسه‌اش را ویرایش کند.

    سه لایه، و لایهٔ دوم و سوم فقط برای جلسه‌های Outlook است:

      • جلسهٔ داخلی — سازنده و هر نقش مدیریتی (رفتار همیشگی، دست‌نخورده).
      • جلسهٔ همگام با Outlook — فقط **سازنده و ادمین**. مدیرعامل و مدیر
        اجرایی از این یکی بیرون‌اند: ویرایشِ اینجا به تقویم و موبایل همهٔ
        شرکت‌کنندگان می‌رود و «Updated:» می‌فرستد؛ آن دامنهٔ گسترده برای
        دیدن ساخته شده بود، نه برای فرستادن دعوت به‌نام کس دیگر.
      • جلسه‌ای که برگزارکننده‌اش بیرون از سازمان است — هیچ‌کس. رویدادش مالِ
        ما نیست و Graph هم اجازهٔ نوشتنش را نمی‌دهد.
    """
    if getattr(meeting, 'outlook_readonly', False):
        return False
    if getattr(meeting, 'outlook_synced', False):
        return meeting.organizer_id == user.id or is_admin(user)
    return meeting.organizer_id == user.id or is_manager(user)


def assert_can_edit(user, meeting):
    if can_edit_meeting(user, meeting):
        return
    if getattr(meeting, 'outlook_readonly', False):
        raise PermissionDenied(
            'برگزارکنندهٔ این جلسه بیرون از سازمان است؛ ویرایشش فقط در Outlook ممکن است.')
    if getattr(meeting, 'outlook_synced', False):
        raise PermissionDenied(
            'این جلسه با Outlook همگام است؛ فقط سازندهٔ جلسه و ادمین می‌توانند ویرایشش کنند.')
    raise PermissionDenied('فقط سازندهٔ جلسه یا نقش‌های مدیریتی می‌توانند این جلسه را ویرایش کنند.')


class ManagerOnlyDeleteMixin:
    """حذف تعریف‌ها (افراد، محل‌ها، سازمان‌ها) فقط برای نقش‌های مدیریتی."""

    def perform_destroy(self, instance):
        if not is_manager(self.request.user):
            raise PermissionDenied('حذف این مورد فقط از عهدهٔ ادمین، مدیرعامل یا مدیر اجرایی برمی‌آید.')
        instance.delete()


HIDDEN_TITLE = 'جلسه سازمانی'


def _overlapping(start, end, exclude_meeting_id=None):
    """جلسه‌های لغونشده‌ای که با این بازه هم‌پوشانی دارند."""
    qs = (Meeting.objects
          .filter(start__lt=end, end__gt=start)
          .exclude(status=Meeting.Status.CANCELLED)
          .select_related('location'))
    if exclude_meeting_id:
        qs = qs.exclude(pk=exclude_meeting_id)
    return qs


def find_conflicts(start, end, user_ids, exclude_meeting_id=None, viewer=None):
    """
    جلسه‌های هم‌زمانِ افرادِ داده‌شده را برمی‌گرداند.

    این فقط یک هشدار است و هیچ‌جا مانع افزودن فرد یا ساخت جلسه نمی‌شود.
    بازه‌ها وقتی تداخل دارند که start < other_end و end > other_start باشد.

    اگر جلسهٔ متداخل جزو دامنهٔ دیدِ `viewer` نباشد (مثلاً جلسهٔ مدیرعامل)،
    خبرِ گرفتاربودنِ آن فرد داده می‌شود ولی عنوان جلسه پنهان می‌ماند — وگرنه
    همین هشدار به راهی برای خواندن عنوان جلسه‌های پنهان تبدیل می‌شد.
    """
    from .serializers import to_iso_date, to_float_hour

    user_ids = [str(u) for u in user_ids if u]
    if not user_ids:
        return []

    qs = (_overlapping(start, end, exclude_meeting_id)
          .filter(meeting_participants__user_id__in=user_ids)
          .prefetch_related('meeting_participants__user')
          .distinct())

    visible = _visible_ids(viewer, qs)
    wanted = set(user_ids)
    conflicts = []
    for meeting in qs:
        shown = meeting.pk in visible
        for mp in meeting.meeting_participants.all():
            if str(mp.user_id) not in wanted:
                continue
            person = mp.user
            conflicts.append({
                'user': str(mp.user_id),
                'userName': person.get_full_name() or person.username,
                'meeting': str(meeting.pk) if shown else '',
                'meetingTitle': meeting.title if shown else HIDDEN_TITLE,
                'date': to_iso_date(meeting.start),
                'start': to_float_hour(meeting.start),
                'end': to_float_hour(meeting.end),
                'room': meeting.location.name if meeting.location_id else '',
            })
    return conflicts


def _visible_ids(viewer, qs):
    """از میان این جلسه‌ها، کدام‌ها برای این کاربر قابل دیدن‌اند؟"""
    if viewer is None:
        return {m.pk for m in qs}
    return set(meetings_queryset(viewer)
               .filter(pk__in=[m.pk for m in qs]).values_list('pk', flat=True))


def find_room_conflicts(start, end, room_id, exclude_meeting_id=None, viewer=None):
    """
    جلسه‌های دیگری که همین محل را در همین بازه گرفته‌اند.

    اتاق برخلاف آدم قابل تقسیم نیست، پس این هشدار جدی‌تر از تداخل افراد است؛
    با این حال باز هم فقط هشدار است و جلوی ثبت را نمی‌گیرد.
    """
    from .serializers import to_iso_date, to_float_hour

    if not room_id:
        return []
    qs = _overlapping(start, end, exclude_meeting_id).filter(location_id=room_id)
    visible = _visible_ids(viewer, qs)
    return [{
        'meeting': str(m.pk) if m.pk in visible else '',
        'meetingTitle': m.title if m.pk in visible else HIDDEN_TITLE,
        'date': to_iso_date(m.start),
        'start': to_float_hour(m.start),
        'end': to_float_hour(m.end),
        'room': m.location.name if m.location_id else '',
    } for m in qs]


def notify_created(meeting, creator, repeats: int = 1) -> tuple[int, int]:
    """
    به شرکت‌کنندگانِ دارای شماره خبر ساخته‌شدن جلسه را پیامک می‌کند.

    خودِ سازنده کنار گذاشته می‌شود؛ کسی که همین حالا جلسه را ساخته لازم نیست
    برای خودش پیامک بگیرد.

    `repeats` تعدادِ جلسه‌های یک سلسلهٔ تکرار است. از سلسله فقط **نزدیک‌ترین**
    جلسه پیامک می‌شود (خواستهٔ صریحِ کارفرما)، ولی همان یک پیامک می‌گوید که
    جلسه تکرار می‌شود — وگرنه شرکت‌کننده از جلسه‌های بعدی بی‌خبر می‌ماند و
    پیامکی هم برایشان نخواهد گرفت.
    """
    from .jalali import fa_date, fa_digits, fa_weekday
    from .sms import send_text

    local = timezone.localtime(meeting.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    when = f'{fa_weekday(local.date())} {fa_date(local.date())} ساعت {clock}'
    who = creator.get_full_name() or creator.username
    lines = [f'جلسه «{meeting.title}» برای {when} توسط {who} برای شما ایجاد شد.']
    if repeats > 1:
        lines.append(f'این جلسه {fa_digits(str(repeats))} نوبت تکرار می‌شود؛ '
                     'نوبت‌های بعدی در تقویم شما هست.')
    lines.append('گرین‌پی')
    text = '\n'.join(lines)

    ok = bad = 0
    for mp in meeting.meeting_participants.select_related('user'):
        if mp.is_guest or mp.user_id == creator.id or not mp.user.phone:
            continue
        if send_text(mp.user.phone, text, tag='greenpay-meeting-created').sent:
            ok += 1
        else:
            bad += 1
    return ok, bad


def _safe_notify_created(meeting, creator, repeats: int = 1) -> tuple[int, int]:
    """`notify_created` که سرویسِ پیامکِ خوابیده، ساختِ جلسه را نمی‌شکند."""
    try:
        return notify_created(meeting, creator, repeats)
    except Exception:                                       # noqa: BLE001
        logger.exception('پیامک ساخت جلسه فرستاده نشد')
        return 0, 0


def _series_conflicts(occurrences, viewer) -> tuple[list, list]:
    """تداخلِ همهٔ نوبت‌های یک سلسله، بی‌آنکه نوبت‌ها با هم تداخل بدهند.

    `exclude_meeting_id` در `_overlapping` **مفرد** است، پس با چهار نوبتِ
    ذخیره‌شده هر نوبت خواهرهایش را به‌عنوان تداخل گزارش می‌کرد و کاربر چهار
    هشدارِ بی‌معنا می‌دید. این‌جا خواهرها بعد از محاسبه کنار گذاشته می‌شوند.

    تداخلِ پنهان (`meeting` خالی) حفظ می‌شود: رشتهٔ خالی هیچ‌وقت شناسهٔ خواهر
    نیست.
    """
    siblings = {str(row.pk) for row in occurrences}
    people: list = []
    rooms: list = []
    for row in occurrences:
        attendees = [str(p.user_id) for p in row.meeting_participants.all()]
        people += [c for c in find_conflicts(
            row.start, row.end, attendees, exclude_meeting_id=row.pk, viewer=viewer)
            if c['meeting'] not in siblings]
        rooms += [c for c in find_room_conflicts(
            row.start, row.end, row.location_id, exclude_meeting_id=row.pk, viewer=viewer)
            if c['meeting'] not in siblings]
    return people, rooms


def notify_changed(meeting, editor, what: list[str]) -> tuple[int, int]:
    """
    وقتی زمان یا محل جلسه عوض شد، به شرکت‌کنندگان خبر می‌دهد.

    `what` می‌گوید چه چیزی عوض شده تا متن پیامک همان را بگوید؛ تغییر عنوان یا
    اولویت پیامک ندارد، چون کسی برنامه‌اش را بابت آن‌ها عوض نمی‌کند.
    """
    from .jalali import fa_date, fa_digits, fa_weekday
    from .sms import send_text

    local = timezone.localtime(meeting.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    when = f'{fa_weekday(local.date())} {fa_date(local.date())} ساعت {clock}'
    where = meeting.location.name if meeting.location_id else 'جلسهٔ آنلاین'
    lines = [f'{" و ".join(what)} جلسه «{meeting.title}» تغییر کرد.',
             f'زمان تازه: {when}',
             f'محل: {where}',
             'گرین‌پی']
    text = '\n'.join(lines)

    ok = bad = 0
    for mp in meeting.meeting_participants.select_related('user'):
        if mp.is_guest or mp.user_id == getattr(editor, 'id', None) or not mp.user.phone:
            continue
        if send_text(mp.user.phone, text, tag='greenpay-meeting-changed').sent:
            ok += 1
        else:
            bad += 1
    return ok, bad


def notify_cancelled(meeting) -> tuple[int, int]:
    """به همهٔ شرکت‌کنندگانِ دارای شماره خبر لغو را پیامک می‌کند."""
    from .jalali import fa_date, fa_digits, fa_weekday
    from .sms import send_text

    local = timezone.localtime(meeting.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    when = f'{fa_weekday(local.date())} {fa_date(local.date())} ساعت {clock}'
    text = '\n'.join(['جلسه لغو شد', meeting.title, when, 'گرین‌پی'])

    ok = bad = 0
    for mp in meeting.meeting_participants.select_related('user'):
        if mp.is_guest or not mp.user.phone:
            continue
        if send_text(mp.user.phone, text, tag='greenpay-meeting-cancelled').sent:
            ok += 1
        else:
            bad += 1
    return ok, bad


def notify_approval_result(meeting, *, approved: bool, reason: str = '',
                           reverted: bool = False) -> tuple[int, int]:
    """نتیجهٔ تایید/رد رزرو را فقط به سازندهٔ جلسه پیامک می‌کند.

    شرکت‌کنندگان تا لحظهٔ تایید هیچ خبری از این جلسه نگرفته‌اند؛ رد هم برایشان
    بی‌معناست. سازنده اما منتظر جواب است — پس چه تایید شود چه رد، به او خبر
    می‌دهیم. پیامکِ ایجاد برای شرکت‌کنندگان جدا و فقط بعد از تایید می‌رود.
    """
    from .jalali import fa_date, fa_digits, fa_weekday
    from .sms import send_text

    creator = meeting.organizer
    if not creator or not creator.phone:
        return 0, 0

    local = timezone.localtime(meeting.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    when = f'{fa_weekday(local.date())} {fa_date(local.date())} ساعت {clock}'
    where = meeting.location.name if meeting.location_id else 'جلسهٔ آنلاین'
    if approved:
        lines = [f'رزرو محل جلسه «{meeting.title}» تایید شد.',
                 f'{when}', f'محل: {where}', 'گرین‌پی']
        tag = 'greenpay-meeting-approved'
    else:
        lines = [f'رزرو محل جلسه «{meeting.title}» رد شد.',
                 f'{when}', f'محل: {where}']
        if reason:
            lines.append(f'دلیل: {reason}')
        if reverted:
            # وگرنه سازنده فکر می‌کند جلسه لغو شده؛ حال آنکه فقط تغییرش رد شده.
            lines.append('جلسه به زمان و محل پیشین برگشت.')
        lines.append('گرین‌پی')
        tag = 'greenpay-meeting-rejected'
    text = '\n'.join(lines)
    if send_text(creator.phone, text, tag=tag).sent:
        return 1, 0
    return 0, 1


def _safe_notify_approval_result(meeting, *, approved: bool, reason: str = '',
                                 reverted: bool = False) -> tuple[int, int]:
    try:
        return notify_approval_result(meeting, approved=approved, reason=reason,
                                      reverted=reverted)
    except Exception:                                       # noqa: BLE001
        logger.exception('پیامک نتیجهٔ تایید فرستاده نشد')
        return 0, 0


def _revert_diff(meeting, was: dict) -> list[str]:
    """عکسِ پیش‌از‌ویرایش را با وضعِ فعلی می‌سنجد و می‌گوید چه عوض شده.

    خروجی همان قالبِ `what` در `notify_changed` است («زمان»/«محل»). مقایسهٔ
    محل روی رشته انجام می‌شود چون در عکس، UUID به‌شکل رشته ذخیره شده.
    """
    what = []
    if (was.get('start') != meeting.start.isoformat()
            or was.get('end') != meeting.end.isoformat()):
        what.append('زمان')
    now_room = str(meeting.location_id) if meeting.location_id else None
    if (was.get('room') or None) != now_room:
        what.append('محل')
    return what


def _apply_revert(meeting, was: dict) -> bool:
    """زمان و محلِ جلسه را به عکسِ پیش‌از‌ویرایش برمی‌گرداند.

    فقط همین سه چیز برمی‌گردند — عنوان و اولویت و شرکت‌کننده‌ها دروازهٔ تایید
    ندارند و ویرایششان پذیرفته است؛ آن‌ها سرِ جای تازه‌شان می‌مانند.
    """
    from django.utils.dateparse import parse_datetime

    begins, ends = parse_datetime(was.get('start') or ''), parse_datetime(was.get('end') or '')
    if not begins or not ends:
        # عکسِ خراب: جلسه را به زمانِ نامعلوم نمی‌بریم، فقط انتظار را تمام
        # می‌کنیم. بی این نگهبان، یک رکوردِ ناقص جلسه را به `None` می‌برد.
        logger.error('عکسِ پیش‌از‌ویرایشِ جلسهٔ %s خوانده نشد: %r', meeting.pk, was)
        return False
    meeting.start, meeting.end = begins, ends
    meeting.location_id = was.get('room') or None
    return True


def reminder_state(meeting, user):
    """
    تنظیم یادآور همین کاربر برای همین جلسه.

    تا وقتی کاربر چیزی عوض نکرده ردیفی در دیتابیس نیست و پیش‌فرض سامانه
    برگردانده می‌شود؛ فرانت هم همین را نشان می‌دهد.
    """
    from django.conf import settings as dj_settings
    from datetime import timedelta

    from .sms import delivery_label

    row = MeetingReminder.objects.filter(meeting=meeting, user=user).first()
    lead = row.lead_minutes if row else dj_settings.MEETING_REMINDER_LEAD_MINUTES
    enabled = row.enabled if row else True
    send_at = meeting.start - timedelta(minutes=lead)
    is_part = (meeting.organizer_id == user.id
               or meeting.meeting_participants.filter(user_id=user.id).exists())
    return {
        'leadMinutes': lead,
        'enabled': enabled,
        'sendDate': to_iso(send_at),
        'sendHour': hour_of(send_at),
        'sentAt': int(row.sent_at.timestamp() * 1000) if row and row.sent_at else None,
        'error': row.send_error if row else '',
        'msgId': row.provider_msg_id if row else '',
        'delivery': delivery_label(row.delivery_code) if row and row.delivery_code is not None else '',
        'delivered': (row.delivery_code == 10) if row and row.delivery_code is not None else None,
        'applies': is_part and bool(getattr(user, 'phone', '')),
        'hasPhone': bool(getattr(user, 'phone', '')),
        'choices': MeetingReminder.LEAD_CHOICES,
    }


def to_iso(dt):
    from .serializers import to_iso_date
    return to_iso_date(dt)


def hour_of(dt):
    from .serializers import to_float_hour
    return to_float_hour(dt)


def _by_id(serializer_data):
    """لیست سریالایزشده → دیکشنری کلیددار با id (شکل موردنیاز فرانت)."""
    return {row['id']: row for row in serializer_data}


def can_approve_location(user, location) -> bool:
    """آیا این کاربر برای این محل تاییدکننده است؟

    فقط ادمین، و فقط اگر در `location.approvers` باشد. مدیرعامل عمداً
    کنار است — حتی اگر به‌اشتباه در M2M باشد، `is_admin` ردش می‌کند.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if location is None or not getattr(location, 'needs_approval', False):
        return False
    if not is_admin(user):
        return False
    return location.approvers.filter(pk=user.pk).exists()


def can_approve_meeting(user, meeting=None) -> bool:
    """تایید رزروِ محل‌های حساس — فقط ادمینِ تعیین‌شده برای آن محل.

    بدون `meeting`: آیا اصلاً برای حداقل یک محل تاییدکننده است؟ (ناوبری و
    bootstrap). با `meeting`: آیا همان محلِ جلسه را تایید می‌کند؟

    مدیرعامل هرگز True نمی‌گیرد.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if not is_admin(user):
        return False
    if meeting is not None:
        return can_approve_location(user, getattr(meeting, 'location', None))
    return Location.objects.filter(needs_approval=True, approvers=user).exists()


def ceo_meeting_ids():
    """شناسهٔ جلسه‌هایی که مدیرعامل در آن‌هاست — چه سازنده، چه شرکت‌کننده."""
    return (Meeting.objects
            .filter(Q(organizer__role=User.Role.CEO) | Q(participants__role=User.Role.CEO))
            .values('pk'))


def shared_owner_ids(user):
    """شناسهٔ کسانی که تقویمشان را با این کاربر به اشتراک گذاشته‌اند."""
    return CalendarShare.objects.filter(viewer=user).values('owner')


def meetings_queryset(user=None):
    """
    جلسات قابل مشاهده برای این کاربر.

    سه لایه:
      • ادمین — همه چیز.
      • مدیرعامل و مدیر اجرایی — همهٔ جلسات سازمان، به‌جز جلسه‌هایی که
        مدیرعامل در آن‌هاست؛ آن‌ها فقط برای شرکت‌کنندگان خودشان دیده
        می‌شوند. جلسهٔ شخصیِ مدیرعامل (که کسی جز خودش در آن نیست) با همین
        قاعده فقط برای خودش و ادمین می‌ماند.
      • کاربر عادی — فقط جلسه‌هایی که خودش در آن‌هاست.

    به‌علاوهٔ همهٔ این‌ها: تقویم‌هایی که دیگران با او به اشتراک گذاشته‌اند
    (`CalendarShare`). «تقویم مبدأ» یعنی جلسه‌هایی که مبدأ سازنده یا
    شرکت‌کنندهٔ آن‌هاست — دقیقاً همان چیزی که خودش می‌بیند.

    این تابع تنها گلوگاه دید سرور است؛ `entries_queryset`، `bootstrap`،
    گزارش‌ها و هشدار تداخل همه از همین‌جا مشتق می‌شوند، پس اشتراک با یک
    تغییر همه‌جا درست عمل می‌کند.
    """
    qs = (Meeting.objects
          .select_related('category', 'location', 'organizer')
          .prefetch_related('meeting_participants', 'agenda__attachments', 'attachments')
          .order_by('start'))
    if user is None or is_admin(user):
        return qs

    owners = shared_owner_ids(user)
    mine = Q(organizer=user) | Q(participants=user)
    shared = Q(organizer__in=owners) | Q(participants__in=owners)
    if is_manager(user):
        qs = qs.filter(mine | shared | ~Q(pk__in=ceo_meeting_ids()))
    else:
        qs = qs.filter(mine | shared)
    return qs.distinct()


def entries_queryset(user=None):
    """
    آیتم‌های صورت‌جلسه، با همان دامنهٔ دیدِ خودِ جلسات.

    پیش‌تر اینجا فقط «مدیر است یا نه» بررسی می‌شد؛ با آمدن مدیر اجرایی، آن
    قاعده صورت‌جلسهٔ جلسه‌های مدیرعامل را هم به او می‌داد. حالا هر دو از یک
    منبع تصمیم می‌گیرند.
    """
    qs = (MinuteEntry.objects
          .select_related('minutes', 'minutes__meeting')
          .prefetch_related('attachments')
          .order_by('-created_at'))
    if user is not None:
        qs = qs.filter(minutes__meeting__in=meetings_queryset(user)).distinct()
    return qs


def _stamp(queryset, *fields):
    """``[تعداد, بزرگ‌ترین زمانِ تغییر]`` برای یک مجموعه.

    زمان به ثانیهٔ epoch برمی‌گردد چون فرانت فقط مقایسه‌اش می‌کند و هیچ‌وقت
    نمایشش نمی‌دهد؛ عدد از رشتهٔ ISO هم ارزان‌تر مقایسه می‌شود.

    تعداد کنارِ زمان لازم است و تشریفاتی نیست: **حذفِ** یک ردیف هیچ زمانی را
    بالا نمی‌برد، پس با مهرِ زمانیِ تنها، پاک‌شدن یک جلسه هیچ‌وقت به کلاینت
    نمی‌رسید.

    ``order_by()`` و ``distinct=True``: این queryset‌ها برای نمایش ساخته شده‌اند
    (مرتب‌سازی + join روی M2M)، و aggregate روی همان شکل، هم ORDER BY بی‌مصرف
    می‌سازد هم ردیف‌های تکراری می‌شمارد.
    """
    from django.db.models import Count, Max

    aggregates = {'n': Count('pk', distinct=True)}
    for i, field in enumerate(fields):
        aggregates[f't{i}'] = Max(field)
    row = queryset.order_by().aggregate(**aggregates)

    moments = [row[f't{i}'] for i in range(len(fields))]
    latest = max((m for m in moments if m is not None), default=None)
    return [row['n'] or 0, latest.timestamp() if latest else 0]


@api_view(['GET'])
def room_bookings(request):
    """وضعیت رزروِ محل‌های جلسه در یک بازهٔ تاریخی — نمای فقط‌خواندنی.

    چرا این اندپوینت از `meetings_queryset` **عبور نمی‌کند**
    ===================================================

    بقیهٔ سامانه از آن یک گلوگاه رد می‌شود و باید هم رد شود. این‌جا عمداً
    نه: خواستهٔ این نما این است که همه بتوانند ببینند «اتاق طبقه ۳ پنجشنبه
    ساعت ۱۰ گرفته است»، حتی اگر حق دیدنِ آن جلسه را نداشته باشند. وگرنه
    کاربری که نمی‌داند اتاق پر است، همان ساعت را رزرو می‌کند.

    پس **ساعت و محل برای همه** دیده می‌شود و **عنوان فقط برای کسی که از قبل
    حق دیدنش را دارد**. تصمیم‌گیرنده همان `meetings_queryset` است (از راه
    `_visible_ids`)، پس قاعدهٔ «عنوان جلسهٔ مدیرعامل را فقط ادمین و خودش
    می‌بینند» خودبه‌خود برقرار است و قاعدهٔ تازه‌ای نوشته نشده.

    سه چیز که امنیت همین‌جاست:

    • `viewer` حتماً پاس داده می‌شود؛ `_visible_ids(None, …)` هیچ‌چیز را پنهان
      نمی‌کند و اندپوینتی که فراموشش کند همه‌چیز را لو می‌دهد.
    • شناسهٔ جلسهٔ پنهان **خالی** برمی‌گردد، نه فقط عنوانش. این همان چیزی است
      که «کلیک هیچ کاری نکند» را ساختاری می‌کند: رابط شناسه‌ای ندارد که با آن
      جایی برود.
    • برگزارکننده، شرکت‌کننده و دسته در پاسخ **نیستند**. این نما دربارهٔ اتاق
      است، نه دربارهٔ آدم‌ها.
    """
    from datetime import timedelta

    from .serializers import to_float_hour, to_iso_date

    begins = parse_date(request.query_params.get('from', '') or '')
    ends = parse_date(request.query_params.get('to', '') or '')
    if not begins or not ends or ends < begins:
        raise ValidationError({'detail': 'بازهٔ تاریخ نامعتبر است.'})
    # سقف دو ماه: نمای تقویمی بیشتر از این نمی‌خواهد و بازهٔ باز، کوئریِ
    # بی‌مرز روی کلِ جدول جلسات می‌شد.
    if (ends - begins).days > 62:
        raise ValidationError({'detail': 'بازه نمی‌تواند بیش از دو ماه باشد.'})

    lo = from_date_hour(begins, 0)
    hi = from_date_hour(ends + timedelta(days=1), 0)

    # `PENDING` مثل `CANCELLED` از این نما کنار می‌رود: تا تایید نشده،
    # رزرو در تقویم و نمای محل دیده نشود. تداخلِ ساخت جلسه جداگانه از
    # `_overlapping` هنوز PENDING را می‌بیند تا دو نفر همان ساعت را نگیرند.
    qs = (Meeting.objects
          .filter(start__lt=hi, end__gt=lo)
          .exclude(status__in=[Meeting.Status.CANCELLED, Meeting.Status.PENDING])
          .exclude(location__isnull=True)
          .select_related('location')
          .order_by('start'))
    room = request.query_params.get('room', '')
    if room:
        qs = qs.filter(location_id=room)

    visible = _visible_ids(request.user, qs)
    return Response([{
        'meeting': str(m.pk) if m.pk in visible else '',
        'title': m.title if m.pk in visible else HIDDEN_TITLE,
        'room': str(m.location_id),
        'date': to_iso_date(m.start),
        'start': to_float_hour(m.start),
        'end': to_float_hour(m.end),
        'status': m.status,
    } for m in qs])


@api_view(['GET'])
def pulse(request):
    """«از آخرین بار چیزی عوض شده؟» — پاسخِ ارزان برای polling.

    چرا این هست و چرا فرانت مستقیم `bootstrap` را دوره‌ای نمی‌گیرد: آن یکی در
    یک پاسخ همهٔ سازمان‌ها، افراد، اتاق‌ها، **همهٔ** جلسه‌های قابل‌دیدن با
    شرکت‌کننده و دستور جلسهٔ تودرتو، و **همهٔ** آیتم‌های صورت‌جلسه را می‌دهد؛
    صفحه‌بندی هم ندارد. گرفتنش هر چند ثانیه برای هر کاربر، روی سه workerِ
    sync، از خودِ مشکلی که حل می‌کند بدتر است. این‌جا چهار aggregate اجرا
    می‌شود و چند ده بایت برمی‌گردد؛ کلاینت فقط وقتی مهر عوض شده باشد سراغ
    `bootstrap` می‌رود.

    دامنهٔ دید **همان** دامنهٔ bootstrap است، چون از همان دو queryset مشتق
    می‌شود. اگر از گلوگاه دیگری می‌آمد، تغییرِ جلسه‌ای که کاربر حق دیدنش را
    ندارد او را بی‌دلیل به بارگذاری دوباره می‌انداخت — یا بدتر، وجودِ آن جلسه
    را لو می‌داد.
    """
    return Response({
        'm': _stamp(meetings_queryset(request.user), 'updated_at'),
        # سه زمان، چون `MinuteEntry` فقط `created_at` ندارد: ویرایش در
        # `edited_at` می‌نشیند و تیک‌زدنِ مصوبه در `done_at`. با یکی از آن‌ها،
        # تیک‌خوردنِ یک کار برای بقیه دیده نمی‌شد.
        'e': _stamp(entries_queryset(request.user), 'created_at', 'edited_at', 'done_at'),
        'r': _stamp(MeetingReminder.objects.filter(user=request.user), 'updated_at'),
        's': _stamp(
            CalendarShare.objects.filter(Q(owner=request.user) | Q(viewer=request.user)),
            'updated_at'),
    })


@api_view(['GET'])
def bootstrap(request):
    """همهٔ دادهٔ موردنیاز اپ در یک درخواست."""
    people = User.objects.filter(is_external=False).select_related('organization').order_by('id')
    guests = User.objects.filter(is_external=True).select_related('organization').order_by('id')
    ceo = people.filter(role=User.Role.CEO).first() or people.first()

    minutes: dict[str, list] = {}
    for row in MinuteEntrySerializer(entries_queryset(request.user), many=True).data:
        minutes.setdefault(row['meeting'], []).append(row)

    shares = (CalendarShare.objects
              .filter(Q(owner=request.user) | Q(viewer=request.user))
              .select_related('owner', 'viewer'))

    # یادآور پیامکیِ خودِ کاربر برای هر جلسه — کارت جلسه از همین می‌فهمد که
    # یادآور تنظیم شده، حتی وقتی هیچ آیتم یادآوری در صورت‌جلسه نیست.
    reminders = {}
    for row in (MeetingReminder.objects
                .filter(user=request.user, enabled=True)
                .select_related('meeting')):
        send_at = row.send_at
        reminders[str(row.meeting_id)] = {
            'lead': row.lead_minutes,
            'date': to_iso(send_at),
            'hour': hour_of(send_at),
            'sent': row.sent_at is not None,
        }

    return Response({
        'organizations': _by_id(OrganizationSerializer(
            Organization.objects.select_related('kind'), many=True).data),
        'orgKinds': _by_id(OrganizationKindSerializer(OrganizationKind.objects.all(), many=True).data),
        'categories': _by_id(CategorySerializer(Category.objects.all(), many=True).data),
        'rooms': _by_id(LocationSerializer(
            Location.objects.select_related('organization').prefetch_related('approvers'),
            many=True).data),
        'people': _by_id(PersonSerializer(people, many=True).data),
        'guests': _by_id(GuestSerializer(guests, many=True).data),
        'meetings': MeetingSerializer(meetings_queryset(request.user), many=True).data,
        'minutes': minutes,
        'reminders': reminders,
        'currentUser': str(request.user.pk),
        'currentRole': request.user.role,
        'isManager': is_manager(request.user),
        # این دو فقط برای **پنهان‌کردن دکمه** است، نه کنترل دسترسی. کنترلِ
        # واقعی در `MeetingViewSet.create` و اکشن‌های `approve`/`reject` است؛
        # این‌جا برای این است که کاربر دکمه‌ای نبیند که ۴۰۳ می‌گیرد.
        'canCreateMeetings': bool(getattr(request.user, 'can_create_meetings', True)),
        'canApproveMeetings': can_approve_meeting(request.user),
        # اشتراک‌های تقویم — فرانت با داشتن فهرست مبدأها خودش تشخیص می‌دهد
        # هر جلسه مالِ تقویم کیست؛ سریالایزر جلسه دست‌نخورده می‌ماند.
        'sharedWithMe': CalendarShareSerializer(
            shares.filter(viewer=request.user), many=True).data,
        'sharedByMe': CalendarShareSerializer(
            shares.filter(owner=request.user), many=True).data,
        'smsEnabled': bool(ceo and ceo.sms_enabled),
    })


class MeetingViewSet(viewsets.ModelViewSet):
    queryset = meetings_queryset()
    serializer_class = MeetingSerializer

    def get_queryset(self):
        return meetings_queryset(self.request.user)

    def create(self, request, *args, **kwargs):
        # تا امروز این مسیر **هیچ** کنترل دسترسی نداشت. پرچمِ کاربر پیش‌فرض
        # روشن است، پس رفتار موجود عوض نمی‌شود؛ خاموش‌کردنش از پنل ادمین است.
        if not getattr(request.user, 'can_create_meetings', True):
            raise PermissionDenied('اجازهٔ ایجاد جلسه برای حساب شما فعال نیست.')

        write = MeetingCreateSerializer(data=request.data, context={'creator': request.user})
        write.is_valid(raise_exception=True)
        meeting = write.save()
        # نزدیک‌ترین تکرار اول است؛ برای جلسهٔ تک‌نوبتی فهرست یک عضو دارد.
        occurrences = getattr(write, 'occurrences', [meeting])

        for row in occurrences:
            # جلسه‌ای که نقش مدیریتی می‌گذارد، برای بقیه از پیش پذیرفته است؛
            # حضورشان تصمیمِ خودشان نیست که بخواهند تأییدش کنند.
            if is_manager(request.user):
                row.meeting_participants.filter(is_guest=False).update(
                    response=MeetingParticipant.Response.ACCEPTED)
            # به صف ارسال Outlook (وقتی همگام‌سازی خاموش است بی‌اثر است، و
            # جلسهٔ در انتظار تایید هم هرگز dirty نمی‌شود — نگاه کنید به
            # `Meeting.mark_dirty`).
            row.mark_dirty()

        # خبر ساخته‌شدن جلسه همان لحظه پیامک می‌شود؛ اگر سرویس پیامک بالا نباشد
        # نباید ساختِ جلسه شکست بخورد.
        #
        # دو قاعده این‌جا جمع شده‌اند: جلسهٔ در انتظار تایید هیچ پیامکی ندارد
        # (پیامکش موقع تایید می‌رود)، و از یک سلسلهٔ تکرار فقط **نزدیک‌ترین**
        # جلسه پیامک می‌شود — خواستهٔ صریحِ کارفرما، وگرنه چهار پیامک برای یک
        # تصمیم می‌رفت.
        sms_ok = sms_bad = 0
        if meeting.status != Meeting.Status.PENDING:
            sms_ok, sms_bad = _safe_notify_created(meeting, request.user, len(occurrences))

        # هشدار تداخل: جلسه ساخته شده و افراد اضافه شده‌اند؛ این فقط اطلاع‌رسانی است.
        data = MeetingSerializer(meeting).data
        data['smsSent'], data['smsFailed'] = sms_ok, sms_bad
        data['occurrences'] = [str(row.pk) for row in occurrences]
        data['conflicts'], data['roomConflicts'] = _series_conflicts(occurrences, request.user)
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return self._edit(request, partial=kwargs.get('partial', False))

    def partial_update(self, request, *args, **kwargs):
        return self._edit(request, partial=True)

    def _edit(self, request, partial):
        """ویرایش جلسه — فقط سازنده، مدیرعامل یا ادمین."""
        meeting = self.get_object()
        assert_can_edit(request.user, meeting)
        d = request.data
        # وضعیت پیش از ویرایش، برای تشخیص اینکه زمان یا محل عوض شده
        was_start, was_end = meeting.start, meeting.end
        was_room = meeting.location_id

        # `status` عمداً این‌جا نیست.
        #
        # تا امروز بود و بی اعتبارسنجی ذخیره می‌شد، یعنی سازندهٔ جلسه می‌توانست
        # با `PATCH {"status":"confirmed"}` جلسهٔ خودش را تایید کند و دروازهٔ
        # تاییدِ محل را کامل دور بزند (و هر رشتهٔ دلخواهی هم در ستون می‌نشست).
        # وضعیت از این پس فقط از `approve`/`reject`/`cancel` عوض می‌شود.
        simple = {'title': 'title', 'priority': 'priority'}
        for src, field in simple.items():
            if src in d:
                setattr(meeting, field, d[src])
        if 'type' in d:
            meeting.meeting_type = d['type']
        if 'category' in d:
            meeting.category_id = d['category'] or None
        if 'room' in d:
            meeting.location_id = d['room'] or None
        if 'meetLink' in d:
            meeting.meet_link = Meeting.normalize_meet(d['meetLink'])
        if {'date', 'start', 'end'} & set(d):
            day = d.get('date') or to_iso(meeting.start)
            meeting.start = from_date_hour(day, float(d.get('start', hour_of(meeting.start))))
            meeting.end = from_date_hour(day, float(d.get('end', hour_of(meeting.end))))
        meeting.save()

        if 'parts' in d:
            wanted = {str(x) for x in d['parts']}
            meeting.meeting_participants.filter(is_guest=False).exclude(user_id__in=wanted).delete()
            existing = {str(p.user_id) for p in meeting.meeting_participants.filter(is_guest=False)}
            for uid in wanted - existing:
                # برگزارکننده و هر کسی که نقش مدیریتی او را اضافه کرده، پذیرفته است
                auto = (MeetingParticipant.Response.ACCEPTED
                        if str(uid) == str(meeting.organizer_id) or is_manager(request.user)
                        else MeetingParticipant.Response.PENDING)
                MeetingParticipant.objects.get_or_create(
                    meeting=meeting, user_id=uid,
                    defaults={'is_guest': False, 'response': auto})

        if 'guests' in d:
            # مهمان‌ها مثل شرکت‌کننده‌ها قابل افزودن و برداشتن‌اند؛ پاسخ دعوتشان
            # بی‌معناست چون حساب ورود ندارند.
            wanted = {str(x) for x in d['guests']}
            meeting.meeting_participants.filter(is_guest=True).exclude(user_id__in=wanted).delete()
            existing = {str(p.user_id) for p in meeting.meeting_participants.filter(is_guest=True)}
            for uid in wanted - existing:
                MeetingParticipant.objects.get_or_create(
                    meeting=meeting, user_id=uid,
                    defaults={'is_guest': True,
                              'response': MeetingParticipant.Response.PENDING})

        meeting.refresh_from_db()

        # مقایسه بعد از refresh انجام می‌شود، نه بلافاصله بعد از save: مقدارِ
        # آمده از درخواست رشته است («۳») و کلید ذخیره‌شده عدد (۳)؛ مقایسهٔ خام
        # همیشه «عوض شده» می‌داد و هر ویرایشِ ساده — حتی اصلاح عنوان — برای همه
        # پیامکِ «محل جلسه تغییر کرد» می‌فرستاد.
        time_moved = meeting.start != was_start or meeting.end != was_end
        room_moved = meeting.location_id != was_room
        changed = []
        if time_moved:
            changed.append('زمان')
        if room_moved:
            changed.append('محل')

        # دروازهٔ تایید فقط سرِ ساخت نیست — ویرایش هم از آن می‌گذرد.
        #
        # دو حالت جلسهٔ تاییدشده را دوباره به انتظار می‌برد:
        #   • محلش به محلی عوض شود که تایید لازم دارد (رزروِ تازه‌ای است)؛
        #   • زمان یا تاریخش عوض شود در حالی که محلش تایید لازم دارد (همان
        #     رزرو، در بازهٔ دیگری — یعنی تصمیمِ تاییدکننده دربارهٔ بازهٔ قبلی
        #     بود، نه این یکی).
        # عنوان و اولویت و شرکت‌کننده‌ها دروازه ندارند: رزروِ محل را جابه‌جا
        # نمی‌کنند.
        #
        # ترتیب حیاتی است: وضعیت **پیش از** `mark_dirty` عوض می‌شود، وگرنه
        # نگهبانِ `PENDING` داخل `mark_dirty` دیر می‌رسد و دعوت‌نامهٔ Outlook
        # برای تغییری می‌رود که هنوز تایید نشده.
        regated = (
            meeting.status == Meeting.Status.CONFIRMED
            and (time_moved or room_moved)
            and meeting.location_id is not None
            and meeting.location.needs_approval
            # تاییدکنندهٔ همین محل نیازی به تاییدِ خودش ندارد — همان قاعدهٔ ساخت.
            and not can_approve_location(request.user, meeting.location)
        )
        if regated:
            meeting.status = Meeting.Status.PENDING
            meeting.pending_revert = {
                'room': str(was_room) if was_room else None,
                'start': was_start.isoformat(),
                'end': was_end.isoformat(),
            }
            meeting.save(update_fields=['status', 'pending_revert', 'updated_at'])

        meeting.mark_dirty()

        # `PENDING` هم مثل `CANCELLED` پیامکِ تغییر نمی‌گیرد: شرکت‌کننده هنوز
        # هیچ پیامکِ ایجادی نگرفته، و «زمان جلسه عوض شد» برای جلسه‌ای که از
        # وجودش بی‌خبر است بی‌معنا و گیج‌کننده است. برای جلسهٔ تازه‌به‌انتظار‌رفته
        # هم همین سکوت درست است: خبرِ تغییر سرِ تایید می‌رود، نه حالا که ممکن
        # است رد شود و زمان به جای اول برگردد.
        sms_ok = sms_bad = 0
        quiet = (Meeting.Status.CANCELLED, Meeting.Status.PENDING)
        if changed and meeting.status not in quiet:
            try:
                sms_ok, sms_bad = notify_changed(meeting, request.user, changed)
            except Exception:                               # noqa: BLE001
                logger.exception('پیامک تغییر جلسه فرستاده نشد')

        data = MeetingSerializer(meeting).data
        data['smsSent'], data['smsFailed'] = sms_ok, sms_bad
        data['conflicts'] = find_conflicts(
            meeting.start, meeting.end,
            [str(p.user_id) for p in meeting.meeting_participants.all()],
            exclude_meeting_id=meeting.pk, viewer=request.user)
        data['roomConflicts'] = find_room_conflicts(
            meeting.start, meeting.end, meeting.location_id,
            exclude_meeting_id=meeting.pk, viewer=request.user)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='check-conflicts')
    def check_conflicts(self, request):
        """بررسی زنده هنگام پر کردن فرم — بدون ساخت جلسه."""
        try:
            date = str(request.data.get('date', ''))
            start = float(request.data.get('start', 0))
            end = float(request.data.get('end', 0))
            begins, ends = from_date_hour(date, start), from_date_hour(date, end)
        except (TypeError, ValueError):
            return Response({'detail': 'تاریخ یا ساعت نامعتبر است.'}, status=status.HTTP_400_BAD_REQUEST)
        users = list(request.data.get('parts', [])) + list(request.data.get('guests', []))
        exclude = request.data.get('exclude')
        return Response({
            'conflicts': find_conflicts(begins, ends, users, exclude_meeting_id=exclude,
                                        viewer=request.user),
            'roomConflicts': find_room_conflicts(begins, ends, request.data.get('room'),
                                                 exclude_meeting_id=exclude,
                                                 viewer=request.user),
        })

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """
        پاسخ به دعوت‌نامه: پذیرش یا رد — فقط برای خودِ کاربر.

        پیش‌تر این پاسخ روی وضعیت خودِ جلسه می‌نشست، یعنی «رد» یک نفر جلسه را
        برای همه لغو می‌کرد. پاسخ هر کس فقط سطر خودش در شرکت‌کنندگان است.
        """
        meeting = self.get_object()
        accept = bool(request.data.get('accept'))
        row = meeting.meeting_participants.filter(user=request.user).first()
        if not row:
            raise ValidationError({'detail': 'شما در این جلسه شرکت‌کننده نیستید.'})
        row.response = (MeetingParticipant.Response.ACCEPTED if accept
                        else MeetingParticipant.Response.DECLINED)
        row.save(update_fields=['response'])
        meeting.refresh_from_db()
        return Response(MeetingSerializer(meeting).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        لغو جلسه — فقط سازنده، مدیرعامل یا ادمین.

        دلیل لغو در سامانه ثبت می‌شود ولی داخل پیامک نمی‌رود؛ پیامک فقط خبر
        لغو را می‌دهد تا کوتاه بماند و جزئیات در خود اپ دیده شود.
        """
        meeting = self.get_object()
        assert_can_edit(request.user, meeting)
        if meeting.status == Meeting.Status.CANCELLED:
            raise ValidationError({'detail': 'این جلسه قبلاً لغو شده است.'})

        meeting.status = Meeting.Status.CANCELLED
        meeting.cancel_reason = (request.data or {}).get('reason', '').strip()[:2000]
        meeting.cancelled_at = timezone.now()
        meeting.cancelled_by = request.user
        # اگر ویرایشی در انتظار تایید بود، با لغوِ جلسه بی‌معنا می‌شود؛ عکسِ
        # بازگردانی باید پاک شود وگرنه جلسه در فهرستِ «در انتظار» می‌ماند.
        meeting.pending_revert = None
        meeting.save(update_fields=['status', 'cancel_reason', 'cancelled_at',
                                    'cancelled_by', 'pending_revert'])
        # لغو باید به Outlook هم برود — «Canceled:» برای همهٔ شرکت‌کنندگان.
        meeting.mark_dirty()

        # یادآورهای نفرستاده دیگر معنا ندارند
        meeting.reminders.filter(sent_at__isnull=True).update(enabled=False)

        notified, failed = notify_cancelled(meeting)
        data = MeetingSerializer(meeting).data
        data['smsSent'] = notified
        data['smsFailed'] = failed
        return Response(data)

    def _series_of(self, meeting) -> list:
        """جلسه و خواهرهایش — سلسلهٔ تکرار یک‌جا تایید و رد می‌شود.

        تاییدِ نوبت‌به‌نوبت یعنی ادمین باید چهار بار همان تصمیم را بگیرد، و
        بدتر: سلسله می‌توانست نیمی تاییدشده و نیمی در انتظار بماند.
        """
        # جلسه‌ای که بابتِ **ویرایش** به انتظار رفته، تک‌نوبتی تایید می‌شود:
        # ویرایش روی یک نوبت انجام شده و خواهرهایش سرِ جای خودشان‌اند. اگر
        # یک‌جا تایید می‌شد، تغییرِ نوبتِ دیگری هم بی‌آنکه دیده شود تایید
        # می‌شد — و عکسِ بازگردانی‌اش هم بی‌خبر پاک می‌ماند.
        if meeting.pending_revert or not meeting.series:
            return [meeting]
        return list(Meeting.objects
                    .filter(series=meeting.series, status=Meeting.Status.PENDING,
                            pending_revert__isnull=True)
                    .order_by('start'))

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """تایید جلسه‌ای که محلش نیاز به تایید داشت — فقط ادمینِ همان محل.

        ترتیبِ کارها مهم است: اول وضعیت عوض می‌شود، بعد `mark_dirty` (که تا
        وضعیت `PENDING` بود عمداً کاری نمی‌کرد)، و آخر پیامک. از یک سلسله هم
        فقط نزدیک‌ترین نوبت پیامک می‌گیرد، مثل خودِ ساخت.

        دو جور انتظار این‌جا تایید می‌شود و متنِ پیامکشان یکی نیست: جلسهٔ تازه
        پیامکِ **ایجاد** می‌گیرد، و جلسه‌ای که بابتِ ویرایش به انتظار رفته بود
        پیامکِ **تغییر** — شرکت‌کننده‌اش این جلسه را از قبل می‌شناسد.
        """
        meeting = self.get_object()
        if not can_approve_meeting(request.user, meeting):
            raise PermissionDenied('تایید این جلسه فقط از عهدهٔ ادمینِ تعیین‌شده برای محلش برمی‌آید.')
        if meeting.status != Meeting.Status.PENDING:
            raise ValidationError({'detail': 'این جلسه در انتظار تایید نیست.'})

        rows = self._series_of(meeting)
        # جلسه‌ای که بابتِ ویرایش به انتظار رفته بود، شرکت‌کنندگانش از قبل خبر
        # دارند؛ پیامکِ «جلسه ایجاد شد» برایشان غلط است. چه چیزی عوض شده را از
        # همان عکسِ پیش‌از‌ویرایش درمی‌آوریم.
        reverts = {row.pk: row.pending_revert for row in rows}
        for row in rows:
            row.status = Meeting.Status.CONFIRMED
            row.pending_revert = None
            row.save(update_fields=['status', 'pending_revert', 'updated_at'])
            row.mark_dirty()

        nearest = rows[0]
        # اول به سازنده خبر تایید، بعد پیامکِ معوقه به شرکت‌کنندگان.
        a_ok, a_bad = _safe_notify_approval_result(nearest, approved=True)
        was = reverts.get(nearest.pk)
        if was:
            what = _revert_diff(nearest, was)
            c_ok, c_bad = 0, 0
            if what:
                try:
                    # سازنده کنار گذاشته می‌شود، نه تاییدکننده — همان کاری که
                    # `notify_created` پایین‌تر می‌کند. سازنده خودش خبرِ «تایید
                    # شد» را گرفته و دو پیامک برای یک اتفاق لازم ندارد.
                    c_ok, c_bad = notify_changed(nearest, nearest.organizer, what)
                except Exception:                           # noqa: BLE001
                    logger.exception('پیامک تغییر جلسه فرستاده نشد')
        else:
            c_ok, c_bad = _safe_notify_created(nearest, nearest.organizer, len(rows))
        meeting.refresh_from_db()
        data = MeetingSerializer(meeting).data
        data['smsSent'], data['smsFailed'] = a_ok + c_ok, a_bad + c_bad
        data['occurrences'] = [str(row.pk) for row in rows]
        return Response(data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """رد جلسهٔ در انتظار تایید — فقط ادمینِ همان محل.

        شرکت‌کنندگان هیچ‌وقت خبرِ ایجاد نگرفته بودند، پس پیامکِ لغو برایشان
        نمی‌رود. فقط سازنده از نتیجهٔ رد باخبر می‌شود.
        """
        meeting = self.get_object()
        if not can_approve_meeting(request.user, meeting):
            raise PermissionDenied('رد این جلسه فقط از عهدهٔ ادمینِ تعیین‌شده برای محلش برمی‌آید.')
        if meeting.status != Meeting.Status.PENDING:
            raise ValidationError({'detail': 'این جلسه در انتظار تایید نیست.'})

        reason = (request.data or {}).get('reason', '').strip()[:2000]
        rows = self._series_of(meeting)
        nearest = rows[0]

        # ردِ یک **ویرایش** جلسه را لغو نمی‌کند.
        #
        # این جلسه قبلاً تایید شده بود و در تقویمِ همه نشسته؛ کسی خواسته زمان یا
        # محلش را عوض کند و تاییدکننده نپذیرفته. پس چیزی که رد شده همان تغییر
        # است، نه جلسه: زمان و محل به حالِ قبل برمی‌گردند و جلسه تاییدشده
        # می‌ماند. لغوِ آن، یک جلسهٔ سالم را بابتِ یک درخواستِ نپذیرفته از بین
        # می‌برد — و شرکت‌کننده‌ها خبرِ لغوی می‌گرفتند که هیچ‌کس نخواسته بود.
        if nearest.pending_revert:
            reverted = _apply_revert(nearest, nearest.pending_revert)
            # پیامکِ «رد شد» **پیش از** بازگردانی متن می‌گیرد تا سازنده ببیند
            # کدام زمان و محل رد شده، نه همان جایی که جلسه از اول بود.
            sms_ok, sms_bad = _safe_notify_approval_result(
                nearest, approved=False,
                reason=reason or 'رزرو این محل تایید نشد.', reverted=reverted)
            nearest.status = Meeting.Status.CONFIRMED
            nearest.pending_revert = None
            nearest.save(update_fields=['status', 'pending_revert', 'start', 'end',
                                        'location', 'updated_at'])
            # عنوان یا شرکت‌کننده‌ها ممکن است در همان ویرایش عوض شده باشند و در
            # پنجرهٔ انتظار به Outlook نرسیده باشند؛ حالا که جلسه تاییدشده است
            # باید برود.
            nearest.mark_dirty()
            meeting.refresh_from_db()
            data = MeetingSerializer(meeting).data
            data['smsSent'], data['smsFailed'] = sms_ok, sms_bad
            data['occurrences'] = [str(nearest.pk)]
            data['reverted'] = reverted
            return Response(data)

        for row in rows:
            row.status = Meeting.Status.CANCELLED
            row.cancel_reason = reason or 'رزرو این محل تایید نشد.'
            row.cancelled_at = timezone.now()
            row.cancelled_by = request.user
            row.save(update_fields=['status', 'cancel_reason', 'cancelled_at',
                                    'cancelled_by', 'updated_at'])
            row.reminders.filter(sent_at__isnull=True).update(enabled=False)

        sms_ok, sms_bad = _safe_notify_approval_result(
            nearest, approved=False, reason=nearest.cancel_reason)
        meeting.refresh_from_db()
        data = MeetingSerializer(meeting).data
        data['smsSent'], data['smsFailed'] = sms_ok, sms_bad
        data['occurrences'] = [str(row.pk) for row in rows]
        return Response(data)

    @action(detail=True, methods=['post'], url_path='attach')
    def attach(self, request, pk=None):
        """پیوست فایل به خودِ جلسه — سقف ۱۰ مگابایت."""
        from .models import Attachment
        from .uploads import assert_upload_size

        meeting = self.get_object()
        assert_can_edit(request.user, meeting)
        upload = request.FILES.get('file')
        if not upload:
            raise ValidationError({'file': 'فایلی فرستاده نشده است.'})
        assert_upload_size(upload)
        att = meeting.attachments.first()
        if att:
            att.file = upload
            att.name = upload.name
            att.uploaded_by = request.user
            att.save()
        else:
            Attachment.objects.create(
                meeting=meeting, kind=Attachment.Kind.FILE,
                file=upload, name=upload.name, uploaded_by=request.user)
        meeting.mark_dirty()
        return Response(MeetingSerializer(meeting).data)

    @action(detail=True, methods=['get', 'post'], url_path='reminder')
    def reminder(self, request, pk=None):
        """یادآور پیامکی همین کاربر برای همین جلسه — خواندن و تنظیم."""
        meeting = self.get_object()
        if request.method == 'POST':
            data = request.data or {}
            row, _ = MeetingReminder.objects.get_or_create(
                meeting=meeting, user=request.user,
                defaults={'lead_minutes': settings.MEETING_REMINDER_LEAD_MINUTES})
            if 'leadMinutes' in data:
                try:
                    lead = int(data['leadMinutes'])
                except (TypeError, ValueError):
                    raise ValidationError({'leadMinutes': 'مقدار نامعتبر است.'})
                if not 1 <= lead <= 10080:                    # از یک دقیقه تا یک هفته
                    raise ValidationError({'leadMinutes': 'فاصله باید بین ۱ دقیقه تا ۷ روز باشد.'})
                if lead != row.lead_minutes:
                    row.sent_at = None                        # زمان عوض شد، دوباره باید برود
                    row.send_error = ''
                row.lead_minutes = lead
            if 'enabled' in data:
                row.enabled = bool(data['enabled'])
            row.save()
        return Response(reminder_state(meeting, request.user))

def can_write_minutes(user, meeting) -> bool:
    """
    آیا این کاربر اجازهٔ نوشتن در صورت‌جلسهٔ این جلسه را دارد؟

    سه راه:
      • سازندهٔ جلسه یا نقش مدیریتی (همان `can_edit_meeting`).
      • شرکت‌کنندهٔ خودِ جلسه — صورت‌جلسه را کسی می‌نویسد که در جلسه بوده.
      • کسی که یکی از حاضران تقویمش را با او به اشتراک گذاشته **و**
        `can_write_minutes` را روشن کرده. پیش‌فرض خاموش است، پس دیدنِ
        تقویم به‌تنهایی اجازهٔ نوشتن نمی‌دهد.

    پیش از این هیچ دروازه‌ای وجود نداشت: `POST /api/entries/` و
    `entries/<id>/toggle/` هیچ کنترلی نداشتند، پس هر کاربر احرازشده
    می‌توانست در صورت‌جلسهٔ هر جلسه‌ای — حتی جلسه‌ای که حق دیدنش را نداشت —
    آیتم ثبت کند. این تابع همان دروازهٔ نبوده است.
    """
    if can_edit_meeting(user, meeting):
        return True
    if meeting.participants.filter(pk=user.pk).exists():
        return True
    owner_ids = [meeting.organizer_id,
                 *meeting.meeting_participants.values_list('user_id', flat=True)]
    return CalendarShare.objects.filter(
        viewer=user, owner_id__in=owner_ids, can_write_minutes=True).exists()


def assert_can_write_minutes(user, meeting):
    if not can_write_minutes(user, meeting):
        raise PermissionDenied(
            'برای نوشتن در صورت‌جلسهٔ این جلسه دسترسی ندارید؛ '
            'صاحب تقویم باید اجازهٔ نوشتن صورت‌جلسه را روشن کند.')


def can_edit_entry(user, entry) -> bool:
    """
    نویسندهٔ آیتم، یا هرکسی که اجازهٔ نوشتن در صورت‌جلسهٔ این جلسه را دارد.

    نویسندهٔ آیتم عمداً بدون شرط اضافه می‌ماند: اگر دسترسی اشتراکی‌اش بعداً
    برداشته شود، هنوز باید بتواند نوشتهٔ خودش را اصلاح یا پاک کند.
    """
    return entry.created_by_id == user.id or can_write_minutes(user, entry.minutes.meeting)


class MinuteEntryViewSet(viewsets.ModelViewSet):
    queryset = entries_queryset()
    serializer_class = MinuteEntrySerializer

    def get_queryset(self):
        return entries_queryset(self.request.user)

    def create(self, request, *args, **kwargs):
        # سریالایزر جلسه را در دامنهٔ دید همین کاربر حل می‌کند (context)، پس
        # جلسهٔ نادیدنی اصلاً اعتبارسنجی نمی‌شود؛ اجازهٔ نوشتن جدا بررسی می‌شود.
        # فایلِ پیوست از multipart می‌آید (سقف ۱۰ مگابایت در uploads.py).
        write = MinuteEntryCreateSerializer(
            data=request.data,
            context={
                'request': request,
                'upload': request.FILES.get('file'),
                'uploader': request.user,
            })
        write.is_valid(raise_exception=True)
        assert_can_write_minutes(request.user, write.validated_data['meeting'])
        entry = write.save()
        entry.created_by = request.user
        entry.save(update_fields=['created_by'])
        return Response(MinuteEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return self._edit(request)

    def partial_update(self, request, *args, **kwargs):
        return self._edit(request)

    def _edit(self, request):
        """ویرایش آیتم صورت‌جلسه پس از ثبت — نوع آیتم عوض نمی‌شود."""
        entry = self.get_object()
        if not can_edit_entry(request.user, entry):
            raise PermissionDenied('فقط نویسندهٔ این آیتم یا سازندهٔ جلسه می‌تواند ویرایشش کند.')

        d = request.data or {}
        fields = []
        if 'text' in d:
            entry.text = str(d['text']).strip()
            fields.append('text')
        if 'remindDate' in d:
            entry.remind_at = (from_date_hour(parse_date(d['remindDate']), d.get('remindHour') or 9)
                               if d['remindDate'] else None)
            fields.append('remind_at')
        if 'who' in d:
            entry.call_with = str(d['who'])
            fields.append('call_with')
        if 'phone' in d:
            entry.call_phone = str(d['phone'])
            fields.append('call_phone')
        if 'agendaItem' in d:
            entry.agenda_item_id = d['agendaItem'] or None
            fields.append('agenda_item')

        if not fields:
            raise ValidationError({'detail': 'چیزی برای تغییر فرستاده نشده است.'})
        entry.edited_at = timezone.now()
        entry.save(update_fields=fields + ['edited_at'])
        return Response(MinuteEntrySerializer(entry).data)

    def perform_destroy(self, instance):
        if not can_edit_entry(self.request.user, instance):
            raise PermissionDenied('فقط نویسندهٔ این آیتم یا سازندهٔ جلسه می‌تواند حذفش کند.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """تیک انجام‌شدن — برای یادآور و تماس تلفنی."""
        entry = self.get_object()
        assert_can_write_minutes(request.user, entry.minutes.meeting)
        entry.is_done = not entry.is_done
        entry.done_at = timezone.now() if entry.is_done else None
        entry.save(update_fields=['is_done', 'done_at'])
        return Response(MinuteEntrySerializer(entry).data)


class AgendaItemViewSet(viewsets.ModelViewSet):
    """دستور جلسه — ایجاد/ویرایش/حذف فقط توسط سازندهٔ جلسه، مدیرعامل یا ادمین."""
    queryset = AgendaItem.objects.select_related('meeting').prefetch_related('attachments').order_by('order')
    serializer_class = AgendaItemSerializer

    def perform_create(self, serializer):
        from .models import Attachment
        from .uploads import assert_upload_size

        meeting = serializer.validated_data.get('meeting')
        assert_can_edit(self.request.user, meeting)
        last = meeting.agenda.order_by('-order').first()
        item = serializer.save(
            created_by=self.request.user,
            order=serializer.validated_data.get('order') or ((last.order if last else 0) + 1))
        upload = self.request.FILES.get('file')
        if upload:
            assert_upload_size(upload)
            Attachment.objects.create(
                agenda_item=item, kind=Attachment.Kind.FILE,
                file=upload, name=upload.name, uploaded_by=self.request.user)
        # دستور جلسه در بدنهٔ رویداد Outlook می‌رود، پس تغییرش هم باید برود.
        meeting.mark_dirty()

    def perform_update(self, serializer):
        from .models import Attachment
        from .uploads import assert_upload_size

        assert_can_edit(self.request.user, serializer.instance.meeting)
        item = serializer.save()
        upload = self.request.FILES.get('file')
        if upload:
            assert_upload_size(upload)
            att = item.attachments.first()
            if att:
                att.file = upload
                att.name = upload.name
                att.uploaded_by = self.request.user
                att.save()
            else:
                Attachment.objects.create(
                    agenda_item=item, kind=Attachment.Kind.FILE,
                    file=upload, name=upload.name, uploaded_by=self.request.user)
        item.meeting.mark_dirty()

    def perform_destroy(self, instance):
        assert_can_edit(self.request.user, instance.meeting)
        meeting = instance.meeting
        instance.delete()
        meeting.mark_dirty()


class OrganizationKindViewSet(viewsets.ReadOnlyModelViewSet):
    """انواع سازمان — در پنل ادمین جنگو مدیریت می‌شوند."""
    queryset = OrganizationKind.objects.all()
    serializer_class = OrganizationKindSerializer


class OrganizationViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = Organization.objects.select_related('kind')
    serializer_class = OrganizationSerializer

    def create(self, request, *args, **kwargs):
        write = OrganizationCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(OrganizationSerializer(write.save()).data, status=status.HTTP_201_CREATED)


class PersonViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = User.objects.filter(is_external=False).select_related('organization')
    serializer_class = PersonSerializer

    def create(self, request, *args, **kwargs):
        """
        افزودن فرد به فهرست افراد سازمان — ادمین و مدیرعامل.

        کاربر عادی برای دعوت افراد بیرونی به جلسه از /guests/ استفاده می‌کند؛
        آن‌ها مهمان‌اند و در فهرست افراد سازمان نمی‌آیند.
        """
        if not is_manager(request.user):
            raise PermissionDenied('افزودن فرد به فهرست افراد فقط از عهدهٔ ادمین و مدیرعامل برمی‌آید.')
        write = PersonCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(PersonSerializer(write.save()).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='import')
    def bulk_import(self, request):
        """
        درون‌ریزی گروهی افراد از فایل اکسل یا CSV — ادمین و مدیرعامل.

        ستون‌ها بر پایهٔ سرصفحه تشخیص داده می‌شوند (نام، سمت، شماره، سازمان)؛
        ترتیبشان مهم نیست و سرصفحه‌های انگلیسی هم پذیرفته می‌شوند.
        """
        if not is_manager(request.user):
            raise PermissionDenied('درون‌ریزی افراد فقط از عهدهٔ ادمین و مدیرعامل برمی‌آید.')

        upload = request.FILES.get('file')
        if not upload:
            raise ValidationError({'file': 'فایلی فرستاده نشده است.'})
        # درون‌ریزی اکسل سقفِ جداگانه‌ای دارد؛ پیوستِ جلسه ۱۰ مگابایت است.
        from .uploads import assert_upload_size
        assert_upload_size(upload, limit=4 * 1024 * 1024)

        from .people_import import import_people
        try:
            result = import_people(upload, default_org=Organization.objects.first())
        except ValueError as exc:
            raise ValidationError({'file': str(exc)})
        result['people'] = _by_id(PersonSerializer(
            User.objects.filter(pk__in=result.pop('created_ids')), many=True).data)
        return Response(result)


class CalendarShareViewSet(viewsets.ModelViewSet):
    """
    اشتراک تقویم — «تقویم من را چه کسانی می‌بینند» و «تقویم چه کسانی را می‌بینم».

    قاعدهٔ مالکیت در همهٔ عملیات یکی است و اینجا نوشته شده تا در چند جا تکرار
    نشود: **فقط مبدأ** اشتراک را می‌سازد و اجازهٔ نوشتن صورت‌جلسه را عوض
    می‌کند؛ حذف را هر دو طرف می‌توانند (مبدأ پس می‌گیرد، مقصد از دید خودش
    برمی‌دارد).
    """
    serializer_class = CalendarShareSerializer

    def get_queryset(self):
        user = self.request.user
        return (CalendarShare.objects
                .filter(Q(owner=user) | Q(viewer=user))
                .select_related('owner', 'viewer'))

    def create(self, request, *args, **kwargs):
        write = CalendarShareCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        viewer = write.validated_data['viewer']
        if viewer.pk == request.user.pk:
            raise ValidationError({'viewer': 'تقویم خودتان از قبل برای خودتان دیدنی است.'})

        share, created = CalendarShare.objects.get_or_create(
            owner=request.user, viewer=viewer,
            defaults={'can_write_minutes': write.validated_data.get('canWriteMinutes', False)},
        )
        if not created:
            # اشتراک تکراری خطا نیست؛ همان ردیف با تنظیم تازه برمی‌گردد.
            flag = write.validated_data.get('canWriteMinutes')
            if flag is not None and flag != share.can_write_minutes:
                share.can_write_minutes = flag
                share.save(update_fields=['can_write_minutes', 'updated_at'])
        return Response(CalendarShareSerializer(share).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        return self._edit(request)

    def partial_update(self, request, *args, **kwargs):
        return self._edit(request)

    def _edit(self, request):
        """تنها چیز قابل تغییر: اجازهٔ نوشتن صورت‌جلسه — و فقط دستِ مبدأ."""
        share = self.get_object()
        if share.owner_id != request.user.pk:
            raise PermissionDenied('فقط صاحب تقویم می‌تواند اجازهٔ نوشتن صورت‌جلسه را عوض کند.')
        if 'canWriteMinutes' not in (request.data or {}):
            raise ValidationError({'detail': 'چیزی برای تغییر فرستاده نشده است.'})
        share.can_write_minutes = bool(request.data['canWriteMinutes'])
        share.save(update_fields=['can_write_minutes', 'updated_at'])
        return Response(CalendarShareSerializer(share).data)

    def perform_destroy(self, instance):
        # get_queryset از قبل به همین دو طرف محدود است؛ این فقط صریح‌ترش می‌کند.
        if self.request.user.pk not in (instance.owner_id, instance.viewer_id):
            raise PermissionDenied('این اشتراک به شما مربوط نیست.')
        instance.delete()


class GuestViewSet(viewsets.ModelViewSet):
    """
    مهمان خارجی — هر کاربری می‌تواند برای دعوت به جلسهٔ خودش یکی بسازد.

    مهمان‌ها در فهرست «افراد سازمان» نمی‌آیند و حساب ورود ندارند؛ فقط برای
    اینکه بشود آن‌ها را به جلسه اضافه کرد و در صورت‌جلسه نامشان را آورد.
    """
    queryset = User.objects.filter(is_external=True).select_related('organization')
    serializer_class = GuestSerializer

    def create(self, request, *args, **kwargs):
        name = str(request.data.get('name', '')).strip()
        if not name:
            raise ValidationError({'name': 'نام مهمان را وارد کنید.'})
        org_name = str(request.data.get('org', '')).strip()
        org = Organization.objects.filter(name=org_name).first() if org_name else None
        first, _, last = name.partition(' ')
        base = f'guest{User.objects.filter(is_external=True).count() + 1}'
        username, i = base, 1
        while User.objects.filter(username=username).exists():
            i += 1
            username = f'{base}_{i}'
        guest = User.objects.create(
            username=username, first_name=first, last_name=last,
            title=str(request.data.get('role', '')).strip()[:120] or 'مهمان',
            organization=org, is_external=True, role=User.Role.MEMBER,
        )
        guest.set_unusable_password()
        guest.save(update_fields=['password'])
        return Response(GuestSerializer(guest).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if not is_manager(self.request.user):
            raise PermissionDenied('فقط مدیرعامل یا ادمین می‌تواند مهمان را حذف کند.')
        instance.delete()


class LocationViewSet(ManagerOnlyDeleteMixin, viewsets.ModelViewSet):
    queryset = Location.objects.select_related('organization')
    serializer_class = LocationSerializer

    def create(self, request, *args, **kwargs):
        write = LocationCreateSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        return Response(LocationSerializer(write.save()).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return self._edit(request)

    def partial_update(self, request, *args, **kwargs):
        return self._edit(request)

    def _edit(self, request):
        """ویرایش نشانی و مختصات محل — فقط ادمین و مدیرعامل."""
        if not is_manager(request.user):
            raise PermissionDenied('فقط مدیرعامل یا ادمین می‌تواند محل‌ها را ویرایش کند.')
        loc = self.get_object()
        d = request.data or {}
        fields = []
        if 'name' in d and str(d['name']).strip():
            loc.name = str(d['name']).strip()[:120]
            fields.append('name')
        if 'cap' in d:
            loc.capacity = str(d['cap'])[:40]
            fields.append('capacity')
        if 'address' in d:
            loc.address = str(d['address']).strip()
            fields.append('address')
        for key, field in (('lat', 'lat'), ('lng', 'lng')):
            if key in d:
                raw = d[key]
                setattr(loc, field, None if raw in (None, '') else float(raw))
                fields.append(field)
        if not fields:
            raise ValidationError({'detail': 'چیزی برای تغییر فرستاده نشده است.'})
        loc.save(update_fields=fields)
        return Response(LocationSerializer(loc).data)


@api_view(['POST'])
def set_sms(request):
    """فعال/غیرفعال کردن ارسال پیامک اعلان‌ها."""
    enabled = bool(request.data.get('enabled', True))
    user = User.objects.filter(role=User.Role.CEO).first() or User.objects.filter(is_external=False).first()
    if user:
        user.sms_enabled = enabled
        user.save(update_fields=['sms_enabled'])
    return Response({'smsEnabled': enabled})
