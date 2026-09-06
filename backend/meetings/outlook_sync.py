"""
موتور همگام‌سازی دوطرفهٔ Outlook.

## تصمیم معماری‌ای که بقیه از آن می‌آید

برای هر جلسه **دقیقاً یک صندوق مرجع** است — همان که `isOrganizer` دارد. بقیهٔ
صندوق‌ها آینه‌اند و تنها چیزی که از خودشان می‌آورند پاسخ دعوتشان است. Exchange
خودش دعوت را به N صندوق پخش می‌کند؛ اگر ما هم به N نسخه بنویسیم، نتیجه جلسهٔ
تکراری و اکوی بی‌پایان است.

## چرا حلقه ناممکن است

`outlook_dirty` دقیقاً **یک نویسنده** دارد: `Meeting.mark_dirty()`، که فقط از
مسیر API انسانی صدا زده می‌شود. `apply_event()` — که تغییرات ورودی را اعمال
می‌کند — هرگز لمسش نمی‌کند. پس تغییرِ آمده از Outlook هیچ‌وقت ارسال خروجی تولید
نمی‌کند؛ این نتیجهٔ **ساختار فراخوانی** است، نه یک heuristic زمانی.

لایهٔ دومِ محافظت `changeKey` است: هر نوشتن ما مقدار تازه‌ای برمی‌گرداند و
ذخیره می‌شود؛ در واکشی بعدی همان مقدار یعنی «این نوشتهٔ خودمان است، ردش کن».

بدترین حالت (کرش بین PATCH و ذخیرهٔ changeKey) یک اعمالِ زائد است — نه حلقه.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import graph as graph_mod
from . import outlook_map as omap
from .models import (
    Location, Meeting, MeetingParticipant, OutlookEvent, OutlookMailbox,
    OutlookUnmappedAttendee, User,
)

logger = logging.getLogger(__name__)

# فیلدهایی که Outlook در آن‌ها حرف آخر را می‌زند. هرچه اینجا نیست — اولویت،
# دسته، دستور جلسه، صورت‌جلسه، یادآورها — مالِ ماست و دست‌نخورده می‌ماند.
SCHEDULING_FIELDS = ('title', 'start', 'end', 'location', 'meet_link', 'participants')


class SyncStats:
    """شمارشِ آنچه یک اجرا واقعاً انجام داد — خروجی دستور از روی همین ساخته می‌شود."""

    def __init__(self):
        self.pulled = 0          # رویداد خوانده‌شده
        self.created = 0         # جلسهٔ تازه از Outlook
        self.updated = 0         # جلسهٔ به‌روزشده از Outlook
        self.cancelled = 0
        self.echoes = 0          # نوشتهٔ خودمان که رد شد
        self.pushed = 0          # جلسهٔ فرستاده‌شده به Outlook
        self.conflicts = 0
        self.blocked = 0         # نتوانست برود (ایمیل ندارد)
        self.errors: list[str] = []

    def as_lines(self) -> list[str]:
        return [
            f'رویداد خوانده‌شده: {self.pulled}',
            f'جلسهٔ تازه از Outlook: {self.created}',
            f'به‌روزرسانی از Outlook: {self.updated}',
            f'لغو: {self.cancelled}',
            f'اکوی ردشده: {self.echoes}',
            f'فرستاده به Outlook: {self.pushed}',
            f'تعارض: {self.conflicts}',
            f'بدون صندوق (نرفت): {self.blocked}',
        ]


# ==================================================================== کمکی‌ها

def mailbox_map() -> dict[str, OutlookMailbox]:
    """نشانی (کوچک‌حرف) → صندوق فعال."""
    qs = OutlookMailbox.objects.filter(is_active=True).select_related('user')
    if settings.OUTLOOK_MAILBOX_ALLOWLIST:
        qs = qs.filter(email__in=settings.OUTLOOK_MAILBOX_ALLOWLIST)
    return {b.email.lower(): b for b in qs}


def location_map() -> dict[str, int]:
    return {omap.normalize_location(name): pk
            for pk, name in Location.objects.values_list('pk', 'name')}


def active_mailboxes() -> list[OutlookMailbox]:
    now = timezone.now()
    return [b for b in mailbox_map().values() if not b.retry_after or b.retry_after <= now]


def _note_failure(box: OutlookMailbox, detail: str, retry_after: int = 0):
    """
    عقب‌نشینی نمایی برای یک صندوق — بقیه به‌کار خودشان ادامه می‌دهند.

    مهلتِ پیشنهادیِ خودِ سرویس (`Retry-After`) همیشه بر محاسبهٔ ما مقدم است.
    """
    box.consecutive_failures = min(box.consecutive_failures + 1, 12)
    delay = retry_after or min(60 * (2 ** (box.consecutive_failures - 1)), 3600)
    box.retry_after = timezone.now() + timedelta(seconds=delay)
    box.last_error = detail[:300]
    box.save(update_fields=['consecutive_failures', 'retry_after', 'last_error'])


def _note_success(box: OutlookMailbox):
    box.consecutive_failures = 0
    box.retry_after = None
    box.last_error = ''
    box.synced_at = timezone.now()
    box.save(update_fields=['consecutive_failures', 'retry_after', 'last_error', 'synced_at'])


# ==================================================================== ورودی (pull)

def pull_mailbox(client, box: OutlookMailbox, stats: SyncStats, *,
                 full: bool = False, dry_run: bool = False) -> None:
    """
    یک صندوق را تا ته صفحه‌بندی می‌خواند و تغییرات را اعمال می‌کند.

    نکتهٔ ترتیبی: هیچ تراکنشی روی `urlopen` باز نمی‌ماند. هر صفحه اول کامل
    گرفته می‌شود، بعد داخل یک تراکنش کوتاه اعمال می‌شود — وگرنه روی SQLite
    یک درخواست کندِ شبکه کل دیتابیس را برای gunicorn قفل می‌کند.
    """
    start_iso, end_iso = omap.graph_window()
    if full:
        box.delta_link = ''
        box.delta_page_link = ''

    link = box.delta_page_link or box.delta_link
    pages = 0
    while True:
        try:
            payload = client.calendar_view_delta(box.email, start_iso, end_iso, link)
        except graph_mod.GraphError as exc:
            if exc.is_gone:
                # نشانه منقضی شده — همان اجرا کل بازه را می‌خوانیم. امن است چون
                # تطبیق روی `changeKey` است و حذف هرگز از «نبودن» استنتاج نمی‌شود.
                logger.info('نشانهٔ delta صندوق %s منقضی شد؛ بازخوانی کامل.', box.email)
                box.delta_link = ''
                box.delta_page_link = ''
                box.save(update_fields=['delta_link', 'delta_page_link'])
                link = ''
                continue
            raise

        events = payload.get('value') or []
        if not dry_run:
            with transaction.atomic():
                for event in events:
                    apply_event(event, box, stats)
        else:
            stats.pulled += len(events)

        pages += 1
        next_link = payload.get('@odata.nextLink')
        delta_link = payload.get('@odata.deltaLink')

        if next_link:
            link = next_link
            if not dry_run:
                box.delta_page_link = next_link
                box.save(update_fields=['delta_page_link'])
            continue

        if not dry_run:
            box.delta_link = delta_link or ''
            box.delta_page_link = ''
            box.save(update_fields=['delta_link', 'delta_page_link'])
        break


def apply_event(event: dict, box: OutlookMailbox, stats: SyncStats) -> None:
    """
    یک رویداد از Outlook → دیتابیس ما.

    این تابع **هرگز** `outlook_dirty` را ست نمی‌کند. همین یک قاعده است که
    ping-pong را ناممکن می‌کند.
    """
    stats.pulled += 1

    if omap.is_removed(event):
        _cancel_by_remote_id(event.get('id') or '', box, stats)
        return
    if omap.is_series_master(event):
        return                                    # delta خودش سری را باز می‌کند
    if omap.is_all_day(event):
        # یک بلوک ۲۴ساعته در شبکهٔ ساعتیِ تقویم دیوار می‌شود و `find_conflicts`
        # هر مرخصی را با هر جلسه‌ای تداخل نشان می‌دهد — یعنی نابودی اعتبار
        # هشدار تداخل، که پرمراقبت‌ترین قابلیت اپ است.
        return

    remote_id = event.get('id') or ''
    change_key = event.get('changeKey') or ''
    if not remote_id:
        return

    row = (OutlookEvent.objects
           .select_related('meeting')
           .filter(mailbox=box, remote_id=remote_id).first())

    # --- اکو: همان چیزی که خودمان نوشتیم ---
    if row and change_key and row.remote_change_key == change_key:
        stats.echoes += 1
        return

    if omap.is_cancelled(event):
        _cancel_row(row, stats)
        return

    boxes = mailbox_map()
    org_email = omap.organizer_email(event)
    is_organizer = bool(event.get('isOrganizer')) or org_email == box.email.lower()

    if not is_organizer:
        # نسخهٔ آینه‌ای: فقط پاسخ دعوتِ همین صندوق را می‌آورد.
        if org_email in boxes:
            _record_rsvp(event, box, stats)         # مرجع، صندوق دیگری از خودمان است
            return
        # برگزارکنندهٔ بیرونی: یکی از صندوق‌های ما باید «نایب» شود، وگرنه جلسهٔ
        # بیرونی اصلاً وارد نمی‌شود. نایب = کمترین user_id میان شرکت‌کنندگانِ
        # همگام؛ قطعی و مستقل از ترتیبِ پیمایش صندوق‌ها.
        if not _is_deputy(event, box, boxes):
            _record_rsvp(event, box, stats)
            return

    _upsert_meeting(event, box, row, is_organizer, stats)


def _is_deputy(event: dict, box: OutlookMailbox, boxes: dict[str, OutlookMailbox]) -> bool:
    """آیا این صندوق، نایبِ قطعیِ یک رویدادِ بیرونی است؟"""
    candidates = [boxes[addr].user_id for addr, _, _ in omap.attendee_emails(event)
                  if addr in boxes]
    if not candidates:
        return False
    return box.user_id == min(candidates)


def _record_rsvp(event: dict, box: OutlookMailbox, stats: SyncStats) -> None:
    """
    فقط پاسخ دعوتِ این صندوق را ثبت می‌کند — هیچ جلسه‌ای نمی‌سازد و محتوا را
    عوض نمی‌کند. این همان چیزی است که جلسهٔ تکراری را جلوگیری می‌کند.
    """
    uid = omap.outlook_uid(event)
    if not uid:
        return
    meeting = Meeting.objects.filter(outlook_uid=uid).first()
    if not meeting:
        return                                     # هنوز از صندوق مرجع نیامده

    response = ''
    for addr, _, resp in omap.attendee_emails(event):
        if addr == box.email.lower():
            response = resp
            break
    mapped = omap.map_response(response)

    MeetingParticipant.objects.filter(meeting=meeting, user_id=box.user_id).update(
        response=mapped)
    OutlookEvent.objects.update_or_create(
        mailbox=box, remote_id=event.get('id') or '',
        defaults={
            'meeting': meeting,
            'remote_change_key': event.get('changeKey') or '',
            'ical_uid': uid,
            'is_authoritative': False,
            'response': mapped,
            'synced_at': timezone.now(),
        })


def _cancel_by_remote_id(remote_id: str, box: OutlookMailbox, stats: SyncStats) -> None:
    row = OutlookEvent.objects.select_related('meeting').filter(
        mailbox=box, remote_id=remote_id).first()
    _cancel_row(row, stats)


def _cancel_row(row: OutlookEvent | None, stats: SyncStats) -> None:
    """
    لغو — نه حذف.

    `Meeting` هرگز پاک نمی‌شود: صورت‌جلسه، دستور جلسه، پیوست و یادآورها همه
    به آن cascade دارند و یک لغو در Outlook نباید تاریخچهٔ نوشته‌شده در اپ را
    از بین ببرد.

    و لغو از هر طرف برنده است: زنده‌کردن جلسهٔ لغوشده به‌خاطر تغییر عنوانِ طرف
    مقابل قابل دفاع نیست.
    """
    if not row or not row.is_authoritative:
        return
    meeting = row.meeting
    if meeting.status == Meeting.Status.CANCELLED:
        return
    meeting.status = Meeting.Status.CANCELLED
    meeting.cancelled_at = timezone.now()
    meeting.cancel_reason = 'در Outlook لغو شد'
    meeting.outlook_dirty = False                  # لغو از آن طرف آمد؛ برنگردانش
    meeting.save(update_fields=['status', 'cancelled_at', 'cancel_reason',
                                'outlook_dirty', 'updated_at'])
    stats.cancelled += 1


def _upsert_meeting(event: dict, box: OutlookMailbox, row: OutlookEvent | None,
                    is_organizer: bool, stats: SyncStats) -> None:
    uid = omap.outlook_uid(event)
    if not uid:
        return

    meeting = row.meeting if row else Meeting.objects.filter(outlook_uid=uid).first()
    created = meeting is None

    if created and not _within_occurrence_cap(uid):
        return

    start = omap.parse_graph_dt(event.get('start'))
    end = omap.parse_graph_dt(event.get('end'))
    if not start or not end or end <= start:
        return

    boxes = mailbox_map()
    org_email = omap.organizer_email(event)
    organizer_user = boxes[org_email].user if org_email in boxes else None
    external_organizer = organizer_user is None

    if created:
        if organizer_user is None:
            # برگزارکنندهٔ بیرونی: نایب را به‌عنوان سازندهٔ نمایشی می‌گذاریم چون
            # `Meeting.organizer` اجباری است، ولی جلسه فقط‌خواندنی می‌ماند و
            # هرگز به Outlook فرستاده نمی‌شود.
            organizer_user = box.user
        meeting = Meeting(
            title=(event.get('subject') or 'جلسهٔ بدون عنوان')[:255],
            organizer=organizer_user,
            status=Meeting.Status.CONFIRMED,
            meeting_type=Meeting.Type.IN_PERSON,
            outlook_uid=uid,
        )

    conflict = _detect_conflict(meeting, created)

    locations = location_map()
    loc_id, loc_text = omap.match_location(event, locations)

    meeting.title = (event.get('subject') or meeting.title or 'جلسهٔ بدون عنوان')[:255]
    meeting.start = start
    meeting.end = end
    meeting.location_id = loc_id
    meeting.location_text = loc_text
    meeting.meet_link = omap.extract_meet_link(event) or meeting.meet_link
    meeting.meeting_type = (Meeting.Type.ONLINE if meeting.meet_link and not loc_id
                            else Meeting.Type.IN_PERSON)
    meeting.outlook_uid = uid
    meeting.outlook_synced = True
    meeting.outlook_readonly = external_organizer
    if not external_organizer:
        meeting.organizer = organizer_user
    # مهم: پرچم ارسال اینجا پاک می‌شود ولی هرگز ست نمی‌شود.
    if conflict:
        meeting.outlook_dirty = False
        meeting.outlook_conflict_at = timezone.now()
        meeting.outlook_conflict_note = 'تغییر Outlook بر تغییر محلی مقدم شد'
        stats.conflicts += 1
    meeting.save()

    _sync_participants(meeting, event, boxes)

    OutlookEvent.objects.update_or_create(
        mailbox=box, remote_id=event.get('id') or '',
        defaults={
            'meeting': meeting,
            'remote_change_key': event.get('changeKey') or '',
            'ical_uid': uid,
            'is_authoritative': True,
            'synced_at': timezone.now(),
        })

    if created:
        stats.created += 1
    else:
        stats.updated += 1

    if conflict:
        _warn_local_author(meeting)


def _within_occurrence_cap(uid: str) -> bool:
    """
    سقف occurrence برای هر سری.

    بدون این، اولین «استندآپ روزانه»ی سازمان یک دیتابیس ۴۳ جلسه‌ای را به
    هزاران جلسه می‌رساند و `bootstrap` — که همهٔ جلسات را در یک پاسخ می‌دهد —
    از پا درمی‌آید.
    """
    base = uid.split('|')[0]
    if base == uid:
        return True
    return Meeting.objects.filter(
        outlook_uid__startswith=base + '|').count() < settings.OUTLOOK_MAX_OCCURRENCES


def _detect_conflict(meeting, created: bool) -> bool:
    """
    تغییر محلیِ نرفته + تغییر آمده از Outlook = تعارض.

    تشخیص عمداً به `outlook_dirty` تکیه می‌کند و نه به `updated_at`: آن یکی
    `auto_now` است و با نوشتنِ خودِ همگام‌سازی هم بالا می‌رود، پس هر واکشی را
    تعارض نشان می‌داد.
    """
    return (not created) and bool(meeting.pk) and meeting.outlook_dirty


def _warn_local_author(meeting) -> None:
    """
    وقتی تغییر محلی باخت، سازنده باید از موبایلش بفهمد نه از اتاق خالی.

    از همان مسیر پیامکِ موجود می‌رود و مثل بقیهٔ مسیرها، شکست پیامک نباید
    همگام‌سازی را بشکند.
    """
    try:
        from .views import notify_changed
        notify_changed(meeting, None, ['زمان یا محل'])
    except Exception as exc:                       # پیامک هیچ‌وقت مسیر اصلی را نمی‌شکند
        logger.warning('اطلاع‌رسانی تعارض ناموفق: %s', exc)


def _sync_participants(meeting, event: dict, boxes: dict[str, OutlookMailbox]) -> None:
    """
    شرکت‌کنندگان — کاربر داخلی، مهمان خارجی، یا نشانی ناشناخته.

    کاربر ساخته نمی‌شود: کاربرِ ایمیلی نه لاگین با کد یک‌بارمصرف دارد نه پیامک
    می‌گیرد، و فقط انتخابگر افراد را شلوغ می‌کند. نشانی‌های ناشناخته در
    `OutlookUnmappedAttendee` ثبت می‌شوند تا بی‌صدا گم نشوند.
    """
    now = timezone.now()
    seen_user_ids = set()
    domain = (settings.OUTLOOK_MAIL_DOMAIN or '').lower()

    org_email = omap.organizer_email(event)
    rows = omap.attendee_emails(event)
    if org_email and org_email not in [a for a, _, _ in rows]:
        rows = [(org_email, '', 'organizer')] + rows

    for addr, name, resp in rows:
        box = boxes.get(addr)
        if box:
            MeetingParticipant.objects.update_or_create(
                meeting=meeting, user_id=box.user_id,
                defaults={'is_guest': False, 'response': omap.map_response(resp)})
            seen_user_ids.add(box.user_id)
            continue

        internal = domain and addr.endswith('@' + domain)
        if internal:
            row, made = OutlookUnmappedAttendee.objects.get_or_create(
                email=addr, defaults={'display_name': name})
            if not made:
                row.seen_count += 1
                row.display_name = row.display_name or name
                row.last_seen = now
                row.save(update_fields=['seen_count', 'display_name', 'last_seen'])
            continue

        # دامنهٔ بیرونی → مهمان؛ همان شکلی که اپ از قبل برای مهمان‌ها دارد.
        guest = User.objects.filter(email__iexact=addr, is_external=True).first()
        if not guest:
            guest = User.objects.create(
                username=f'guest-{addr}'[:150], email=addr, is_external=True,
                first_name=(name or addr.split('@')[0])[:150], is_active=False)
        MeetingParticipant.objects.update_or_create(
            meeting=meeting, user_id=guest.pk,
            defaults={'is_guest': True, 'response': omap.map_response(resp)})
        seen_user_ids.add(guest.pk)

    # کسی که از دعوت حذف شده، از جلسه هم برداشته می‌شود — ولی فقط برای جلسه‌ای
    # که واقعاً از Outlook می‌آید، تا شرکت‌کنندگانِ افزوده‌شده در اپ پاک نشوند.
    if seen_user_ids:
        (MeetingParticipant.objects
         .filter(meeting=meeting)
         .exclude(user_id__in=seen_user_ids)
         .delete())


# ==================================================================== خروجی (push)

def push_meeting(client, meeting: Meeting, stats: SyncStats, *, dry_run: bool = False) -> None:
    """
    یک جلسهٔ علامت‌خورده را به Outlook می‌فرستد.

    جلسه فقط از صندوق **سازنده** می‌رود. اگر سازنده ایمیل نداشته باشد، جلسه
    اصلاً فرستاده نمی‌شود و `blocked` شمرده می‌شود — نه اینکه از صندوق کس
    دیگری برود: دعوتی که از فرستندهٔ اشتباه بیاید، بعداً قابل لغو هم نیست.
    """
    if meeting.outlook_readonly:
        _clear_dirty(meeting)
        return

    boxes = mailbox_map()
    box = boxes.get((meeting.organizer.email or '').lower())
    if not box:
        stats.blocked += 1
        return

    emails = _attendee_addresses(meeting, boxes, skip=box.email.lower())
    agenda = list(meeting.agenda.order_by('order').values_list('title', flat=True))
    payload = omap.event_payload(meeting, emails, agenda)

    row = OutlookEvent.objects.filter(meeting=meeting, is_authoritative=True).first()

    if dry_run:
        stats.pushed += 1
        return

    if meeting.status == Meeting.Status.CANCELLED:
        if row:
            client.cancel_event(box.email, row.remote_id)
            row.delete()
        _clear_dirty(meeting)
        stats.pushed += 1
        return

    if row:
        result = client.update_event(box.email, row.remote_id, payload)
    else:
        result = client.create_event(box.email, payload)

    # ذخیرهٔ changeKey بلافاصله پس از نوشتن: همین مقدار است که واکشی بعدی را
    # از «تغییرِ تازه» به «اکوی خودمان» تبدیل می‌کند.
    #
    # ردیفِ موجود *در جای خودش* به‌روز می‌شود و شناسهٔ پاسخ کلیدِ upsert نیست:
    # هر ردیف تازه به قید «یک نسخهٔ مرجع برای هر جلسه» می‌خورد، و آن قید باید
    # نگهبان باشد نه چیزی که مسیر عادی به آن بخورد.
    if not row:
        row = OutlookEvent(mailbox=box, meeting=meeting, is_authoritative=True)
    row.remote_id = result.get('id') or row.remote_id
    row.remote_change_key = result.get('changeKey') or ''
    row.ical_uid = result.get('iCalUId') or row.ical_uid or meeting.outlook_uid
    row.synced_at = timezone.now()
    row.save()

    meeting.outlook_uid = meeting.outlook_uid or (result.get('iCalUId') or '')
    meeting.outlook_synced = True
    meeting.outlook_dirty = False
    meeting.save(update_fields=['outlook_uid', 'outlook_synced', 'outlook_dirty', 'updated_at'])
    stats.pushed += 1


def _clear_dirty(meeting: Meeting) -> None:
    if meeting.outlook_dirty:
        meeting.outlook_dirty = False
        meeting.save(update_fields=['outlook_dirty', 'updated_at'])


def _attendee_addresses(meeting, boxes: dict[str, OutlookMailbox], skip: str) -> list[str]:
    """
    نشانی شرکت‌کنندگان برای دعوت.

    کاربر داخلیِ بدون ایمیل در دعوت نمی‌آید — ولی در اپ همچنان شرکت‌کننده است
    و در رابط دیده می‌شود؛ چیزی بی‌صدا حذف نمی‌شود.
    """
    out = []
    for mp in meeting.meeting_participants.select_related('user'):
        addr = (mp.user.email or '').strip().lower()
        if addr and addr != skip:
            out.append(addr)
    return out


def dirty_meetings(limit: int = 0):
    qs = (Meeting.objects
          .filter(outlook_dirty=True, outlook_readonly=False)
          .select_related('organizer')
          .order_by('pk'))
    return qs[:limit] if limit else qs


# ==================================================================== اجرا

def run(*, push: bool = True, pull: bool = True, mailbox: str = '', full: bool = False,
        limit: int = 0, dry_run: bool = False) -> SyncStats:
    """
    یک اجرای کامل: **اول push بعد pull**.

    ترتیب مهم است — نوشته‌های همین اجرا در واکشیِ بلافاصله بعدش با `changeKey`
    به‌عنوان اکو شناخته می‌شوند، به‌جای اینکه تا اجرای بعدی تعارض به نظر برسند.
    """
    stats = SyncStats()
    if not graph_mod.enabled():
        stats.errors.append('outlook-disabled')
        return stats

    client = graph_mod.GraphClient()
    throttles = 0

    if push:
        for meeting in dirty_meetings(limit):
            try:
                push_meeting(client, meeting, stats, dry_run=dry_run)
            except graph_mod.GraphError as exc:
                if exc.is_auth:
                    stats.errors.append('احراز هویت Graph ناموفق — اجرا متوقف شد')
                    return stats
                if exc.is_throttled:
                    throttles += 1
                    if throttles >= 3:
                        stats.errors.append('سرویس در حال محدودسازی است — اجرا زودتر تمام شد')
                        return stats
                stats.errors.append(f'ارسال جلسهٔ {meeting.pk}: {exc.status} {exc.code}')

    if pull:
        interval = timedelta(seconds=settings.OUTLOOK_PULL_INTERVAL_SECONDS)
        now = timezone.now()
        for box in active_mailboxes():
            if mailbox and box.email.lower() != mailbox.lower():
                continue
            # آهنگ per-mailbox در دیتابیس است نه در systemd: عقب‌نشینی و
            # Retry-After به‌هرحال زمان‌بندی per-mailbox می‌خواهند، و گذاشتنش
            # در تایمر یک زمان‌بندِ دومِ متناقض می‌سازد.
            if not full and not mailbox and box.synced_at and box.synced_at + interval > now:
                continue
            try:
                pull_mailbox(client, box, stats, full=full, dry_run=dry_run)
                if not dry_run:
                    _note_success(box)
            except graph_mod.GraphError as exc:
                if exc.is_auth:
                    stats.errors.append('احراز هویت Graph ناموفق — اجرا متوقف شد')
                    return stats
                if exc.is_throttled:
                    throttles += 1
                    _note_failure(box, exc.detail, exc.retry_after)
                    if throttles >= 3:
                        stats.errors.append('سرویس در حال محدودسازی است — اجرا زودتر تمام شد')
                        return stats
                    continue
                hint = ('صندوق زیر ApplicationAccessPolicy نیست'
                        if exc.is_forbidden else exc.detail[:120])
                _note_failure(box, hint)
                stats.errors.append(f'{box.email}: {exc.status} {hint}')

    return stats
