"""
ارسال پیامک یادآور جلسه.

با یک زمان‌بند (systemd timer یا cron) هر چند دقیقه یک‌بار اجرا می‌شود و برای
شرکت‌کنندگانی که زمان یادآورشان رسیده پیامک می‌فرستد. فاصلهٔ یادآور برای هر
«جلسه × کاربر» جداگانه است: اگر کاربر تنظیم خودش را ثبت کرده باشد همان،
وگرنه پیش‌فرض سامانه (یک ساعت).

اجرای دوباره پیامک تکراری نمی‌فرستد، چون لحظهٔ ارسال روی همان ردیف ثبت می‌شود.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from meetings.models import Meeting, MeetingReminder
from meetings.sms import send_text

def fa_digits(text: str) -> str:
    return str(text).translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))


def humanize(minutes: int) -> str:
    """۹۰ → «۱ ساعت و ۳۰ دقیقه»، ۴۵ → «۴۵ دقیقه»."""
    if minutes < 60:
        return f'{fa_digits(max(minutes, 1))} دقیقه'
    h, m = divmod(minutes, 60)
    return f'{fa_digits(h)} ساعت و {fa_digits(m)} دقیقه' if m else f'{fa_digits(h)} ساعت'


def compose(meeting: Meeting, minutes_left: int) -> str:
    """
    متن پیامک یادآور — کوتاه، چون هر ۷۰ نویسه یک پیامک حساب می‌شود.

    فاصله از روی زمانِ واقعیِ باقی‌مانده نوشته می‌شود، نه از روی تنظیم کاربر؛
    اگر ارسال به هر دلیلی عقب افتاده باشد، پیام نباید عدد نادرست بگوید.
    """
    local = timezone.localtime(meeting.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    where = (meeting.location.name if meeting.location_id
             else ('جلسهٔ آنلاین' if meeting.meeting_type == Meeting.Type.ONLINE else ''))
    lines = [f'یادآور جلسه — {humanize(minutes_left)} دیگر', meeting.title, f'ساعت {clock}']
    if where:
        lines.append(where)
    lines.append('گرین‌پی')
    return '\n'.join(lines)


class Command(BaseCommand):
    help = 'ارسال پیامک یادآور برای جلسه‌های نزدیک'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='فقط نشان بده چه پیامکی می‌رفت، چیزی نفرست')
        parser.add_argument('--window', type=int, default=1500,
                            help='تا چند دقیقهٔ آینده جلسه‌ها بررسی شوند (پیش‌فرض ۲۵ ساعت)')

    def handle(self, *args, **opts):
        now = timezone.localtime()
        horizon = now + timedelta(minutes=opts['window'])
        default_lead = settings.MEETING_REMINDER_LEAD_MINUTES

        meetings = (Meeting.objects
                    .filter(start__gt=now, start__lte=horizon)
                    .exclude(status=Meeting.Status.CANCELLED)
                    .select_related('location')
                    .prefetch_related('meeting_participants__user', 'reminders'))

        checked = sent = skipped = failed = 0

        for meeting in meetings:
            overrides = {r.user_id: r for r in meeting.reminders.all()}

            for mp in meeting.meeting_participants.all():
                user = mp.user
                if mp.is_guest:
                    continue
                if not user.phone:
                    skipped += 1               # شماره‌ای ثبت نشده — یادآور شدنی نیست
                    continue
                checked += 1

                reminder = overrides.get(user.pk)
                lead = reminder.lead_minutes if reminder else default_lead
                if reminder and not reminder.enabled:
                    continue
                if reminder and reminder.sent_at:
                    continue

                due = meeting.start - timedelta(minutes=lead)
                if due > now:
                    continue

                # تا وقتی جلسه شروع نشده، یادآورِ عقب‌افتاده هم ارزش فرستادن دارد؛
                # فقط عددِ داخل پیام باید واقعیِ همین لحظه باشد.
                minutes_left = int((meeting.start - now).total_seconds() // 60)
                text = compose(meeting, minutes_left)
                if opts['dry_run']:
                    self.stdout.write(f'→ {user.phone}\n{text}\n')
                    sent += 1
                    continue

                if reminder is None:
                    reminder, _ = MeetingReminder.objects.get_or_create(
                        meeting=meeting, user=user, defaults={'lead_minutes': lead})
                    if reminder.sent_at:
                        continue

                result = send_text(user.phone, text, tag='greenpay-meeting-reminder')
                if result.sent:
                    reminder.sent_at = timezone.now()
                    reminder.send_error = ''
                    reminder.provider_msg_id = result.msg_id
                    sent += 1
                    self.stdout.write(f'✓ {user.phone} — شناسهٔ پیام {result.msg_id or "—"}')
                else:
                    reminder.send_error = result.detail[:200]
                    failed += 1
                    self.stderr.write(f'✗ {user.phone}: {result.detail}')
                reminder.save(update_fields=['sent_at', 'send_error', 'provider_msg_id', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f'بررسی‌شده: {checked} | ارسال: {sent} | ناموفق: {failed} | بدون شماره: {skipped}'))
