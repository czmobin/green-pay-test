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

# پیامکی که بیش از این مقدار از زمانش گذشته باشد دیگر فرستاده نمی‌شود
# (سرویس خاموش بوده یا زمان‌بند اجرا نشده — یادآور کهنه بدتر از نفرستادن است)
STALE_AFTER = timedelta(minutes=30)


def fa_digits(text: str) -> str:
    return str(text).translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))


def compose(reminder: MeetingReminder) -> str:
    """متن پیامک یادآور — کوتاه، چون هر ۷۰ نویسه یک پیامک حساب می‌شود."""
    m = reminder.meeting
    local = timezone.localtime(m.start)
    clock = fa_digits(f'{local.hour:02d}:{local.minute:02d}')
    mins = reminder.lead_minutes
    gap = f'{fa_digits(mins // 60)} ساعت' if mins >= 60 and mins % 60 == 0 else f'{fa_digits(mins)} دقیقه'
    where = m.location.name if m.location_id else ('جلسهٔ آنلاین' if m.meeting_type == Meeting.Type.ONLINE else '')
    lines = [f'یادآور جلسه — {gap} دیگر', m.title, f'ساعت {clock}']
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
                if mp.is_guest or not user.phone:
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
                if now - due > STALE_AFTER:
                    skipped += 1
                    continue

                text = compose(reminder or MeetingReminder(meeting=meeting, user=user,
                                                           lead_minutes=lead))
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
                    sent += 1
                else:
                    reminder.send_error = result.detail[:200]
                    failed += 1
                    self.stderr.write(f'✗ {user.phone}: {result.detail}')
                reminder.save(update_fields=['sent_at', 'send_error', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f'بررسی‌شده: {checked} | ارسال: {sent} | ناموفق: {failed} | کهنه: {skipped}'))
