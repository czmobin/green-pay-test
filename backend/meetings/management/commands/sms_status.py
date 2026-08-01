"""
به‌روزرسانی وضعیت تحویل پیامک‌های یادآور.

سرویس، پیام را می‌پذیرد و شناسه می‌دهد؛ ولی «پذیرفته شد» یعنی تحویل به مخابرات،
نه رسیدن به گوشی. این فرمان وضعیت واقعی را می‌پرسد و روی همان ردیف ثبت می‌کند تا
وقتی کسی می‌گوید «پیامک نیامد» بشود بدون حدس‌زدن جواب داد.

    python manage.py sms_status              # یادآورهای سه روز اخیر
    python manage.py sms_status --days 7
    python manage.py sms_status --by-phone   # جمع‌بندی به تفکیک شماره
"""
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from meetings.models import MeetingReminder
from meetings.sms import delivery_label, delivery_status

CHUNK = 50


class Command(BaseCommand):
    help = 'خواندن وضعیت تحویل پیامک‌های فرستاده‌شده و ثبت آن'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=3)
        parser.add_argument('--by-phone', action='store_true',
                            help='جمع‌بندی وضعیت به تفکیک شمارهٔ گیرنده')

    def handle(self, *args, **opts):
        since = timezone.now() - timedelta(days=opts['days'])
        rows = list(MeetingReminder.objects
                    .filter(sent_at__gte=since)
                    .exclude(provider_msg_id='')
                    .select_related('user', 'meeting'))
        if not rows:
            self.stdout.write('پیامکی برای بررسی نیست.')
            return

        by_id = {r.provider_msg_id: r for r in rows}
        codes: dict[str, int] = {}
        ids = list(by_id)
        for i in range(0, len(ids), CHUNK):
            codes.update(delivery_status(ids[i:i + CHUNK]))

        now = timezone.now()
        updated = []
        for msg_id, code in codes.items():
            row = by_id.get(msg_id)
            if not row:
                continue
            row.delivery_code = code
            row.delivery_checked_at = now
            updated.append(row)
        MeetingReminder.objects.bulk_update(
            updated, ['delivery_code', 'delivery_checked_at'])

        if opts['by_phone']:
            per = defaultdict(lambda: defaultdict(int))
            for r in updated:
                per[r.user.phone or '—'][r.delivery_code] += 1
            self.stdout.write(f'{"شماره":14} {"نام":18} وضعیت‌ها')
            for phone, buckets in sorted(per.items()):
                name = next((r.user.get_full_name() for r in updated
                             if (r.user.phone or '—') == phone), '')
                detail = '، '.join(f'{delivery_label(c)}: {n}' for c, n in sorted(buckets.items()))
                self.stdout.write(f'{phone:14} {name:18} {detail}')
        else:
            for r in sorted(updated, key=lambda x: x.sent_at):
                when = timezone.localtime(r.sent_at).strftime('%m-%d %H:%M')
                self.stdout.write(
                    f'{when}  {r.user.phone or "—":13} {r.user.get_full_name():18} '
                    f'{r.provider_msg_id:>12}  {delivery_label(r.delivery_code)}')

        self.stdout.write(self.style.SUCCESS(f'\nبررسی‌شده: {len(updated)} پیامک'))
