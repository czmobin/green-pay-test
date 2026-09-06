"""
همگام‌سازی دوطرفهٔ جلسات با Outlook سازمانی.

    python manage.py outlook_sync                 # اجرای عادی: اول push بعد pull
    python manage.py outlook_sync --diagnose      # فقط وضعیت اتصال، بدون تغییر
    python manage.py outlook_sync --dry-run       # بگو چه می‌کردی، چیزی ننویس
    python manage.py outlook_sync --backfill --since 2026-01-01

یک دستور، یک قفل، یک جای تصمیمِ ترتیب. تایمر systemd هر دقیقه صدایش می‌زند؛
آهنگِ واقعیِ هر صندوق در دیتابیس است نه در تایمر (نگاه کنید به `outlook_sync.run`).
"""
import fcntl
import os
import tempfile

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_date

from meetings import graph as graph_mod
from meetings import outlook_sync
from meetings.models import Meeting

LOCK_PATH = os.path.join(tempfile.gettempdir(), 'greenpay-outlook-sync.lock')


class Command(BaseCommand):
    help = 'همگام‌سازی دوطرفهٔ جلسات با Outlook'

    def add_arguments(self, parser):
        parser.add_argument('--push', action='store_true', help='فقط ارسال به Outlook')
        parser.add_argument('--pull', action='store_true', help='فقط واکشی از Outlook')
        parser.add_argument('--mailbox', default='', help='فقط این صندوق')
        parser.add_argument('--full', action='store_true',
                            help='نشانهٔ delta را دور بریز و کل بازه را بخوان')
        parser.add_argument('--backfill', action='store_true',
                            help='جلسه‌های موجود را برای ارسال علامت بزن (با --since)')
        parser.add_argument('--since', default='', help='تاریخ شروع backfill (YYYY-MM-DD)')
        parser.add_argument('--limit', type=int, default=0, help='حداکثر جلسه در هر اجرا')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--diagnose', action='store_true',
                            help='فقط وضعیت اتصال را گزارش کن')

    def handle(self, *args, **opts):
        if opts['diagnose']:
            for name, value in graph_mod.probe():
                self.stdout.write(f'  {name:<26} {value}')
            return

        if not graph_mod.enabled():
            # خاموشی خطا نیست: کلیدها هنوز نرسیده‌اند و تایمر هر دقیقه صدا می‌زند.
            self.stdout.write(self.style.WARNING(
                'همگام‌سازی Outlook خاموش است (OUTLOOK_ENABLED یا کلیدها تنظیم نشده‌اند).'))
            return

        if opts['backfill']:
            self._backfill(opts)
            return

        # تک‌نمونه: اجرای هر دقیقه‌ای نباید روی اجرای کندِ قبلی سوار شود.
        with open(LOCK_PATH, 'w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                self.stdout.write('اجرای قبلی هنوز تمام نشده؛ این نوبت رد شد.')
                return

            push = opts['push'] or not opts['pull']
            pull = opts['pull'] or not opts['push']
            stats = outlook_sync.run(
                push=push, pull=pull, mailbox=opts['mailbox'], full=opts['full'],
                limit=opts['limit'], dry_run=opts['dry_run'])

        for line in stats.as_lines():
            self.stdout.write(f'  {line}')
        for err in stats.errors:
            self.stdout.write(self.style.ERROR(f'  ! {err}'))
        if opts['dry_run']:
            self.stdout.write(self.style.WARNING('  (dry-run — چیزی نوشته نشد)'))

    def _backfill(self, opts):
        """
        انتقالِ عمدیِ جلسه‌های موجود به Outlook.

        تنها راه فرستادن جلسه‌های قدیمی است، و عمداً دستی مانده: روشن‌شدن
        خودکارِ کلید نباید انبوهی دعوت‌نامهٔ ماه‌ها پیش را یک‌جا شلیک کند.
        """
        if not opts['since']:
            raise CommandError('برای backfill تاریخ شروع را با --since بدهید (YYYY-MM-DD).')
        since = parse_date(opts['since'])
        if not since:
            raise CommandError('قالب --since باید YYYY-MM-DD باشد.')

        qs = (Meeting.objects
              .filter(start__date__gte=since, outlook_readonly=False)
              .exclude(status=Meeting.Status.CANCELLED))
        if opts['limit']:
            qs = qs[:opts['limit']]
        ids = list(qs.values_list('pk', flat=True))

        if opts['dry_run']:
            self.stdout.write(f'{len(ids)} جلسه علامت می‌خورد (dry-run).')
            return
        Meeting.objects.filter(pk__in=ids).update(
            outlook_dirty=True, local_changed_at=timezone.now())
        self.stdout.write(self.style.SUCCESS(
            f'{len(ids)} جلسه برای ارسال علامت خورد؛ تایمر بعدی می‌فرستدشان.'))
