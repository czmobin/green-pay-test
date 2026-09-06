"""
پر کردن ایمیل کاربران — پیش‌نیاز قطعی همگام‌سازی Outlook.

امروز `User.email` برای هیچ‌کس پر نیست: هویت کاربر در این سامانه شمارهٔ موبایل
است و ایمیل هیچ‌جا خوانده یا نوشته نمی‌شود. اما Graph صندوق‌ها را **فقط** با
ایمیل می‌شناسد، پس بدون این مرحله هیچ خط دیگری از همگام‌سازی معنا ندارد.

    python manage.py outlook_users --source csv --file people.csv
    python manage.py outlook_users --source csv --file people.csv --apply

بدون `--apply` هیچ چیزی نوشته نمی‌شود؛ فقط گزارش سه‌ستونی چاپ می‌شود.

## چرا CSV و نه Graph

`--source graph` به دسترسی اضافهٔ `User.Read.All` نیاز دارد و
`New-ApplicationAccessPolicy` **آن را محدود نمی‌کند** — یعنی برنامه اجازهٔ
خواندن کل دایرکتوری سازمان را می‌گیرد. برای ۱۹ نفر این معاملهٔ بدی است؛ یک
فایل CSV صفر دسترسی اضافه می‌خواهد.
"""
import csv
import io

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from meetings.models import OutlookMailbox, User


def normalize_name(value: str) -> str:
    return ' '.join((value or '').replace('‌', ' ').split()).strip().lower()


def normalize_phone(value: str) -> str:
    from meetings.sms import normalize_phone as np
    return np(value or '')


class Command(BaseCommand):
    help = 'اتصال ایمیل سازمانی به کاربران و ساخت صندوق‌های Outlook'

    def add_arguments(self, parser):
        parser.add_argument('--source', choices=['csv', 'graph'], default='csv')
        parser.add_argument('--file', help='مسیر فایل CSV با ستون‌های نام/شماره و ایمیل')
        parser.add_argument('--apply', action='store_true',
                            help='بدون این، هیچ چیزی نوشته نمی‌شود')
        parser.add_argument('--deactivate-missing', action='store_true',
                            help='صندوق کسانی که در فایل نیستند غیرفعال شود')

    def handle(self, *args, **opts):
        if opts['source'] == 'graph':
            raise CommandError(
                'منبع graph به دسترسی User.Read.All نیاز دارد که ApplicationAccessPolicy '
                'محدودش نمی‌کند. برای این تعداد کاربر از --source csv استفاده کنید.')

        path = opts.get('file')
        if not path:
            raise CommandError('مسیر فایل را با --file بدهید.')
        try:
            with open(path, encoding='utf-8-sig') as fh:
                rows = list(csv.DictReader(io.StringIO(fh.read())))
        except OSError as exc:
            raise CommandError(f'فایل خوانده نشد: {exc}')
        if not rows:
            raise CommandError('فایل خالی است.')

        domain = (settings.OUTLOOK_MAIL_DOMAIN or '').lower()
        people = list(User.objects.filter(is_external=False))
        by_name = {}
        by_phone = {}
        for p in people:
            by_name.setdefault(normalize_name(p.get_full_name() or p.username), []).append(p)
            if p.phone:
                by_phone.setdefault(normalize_phone(p.phone), []).append(p)

        matched, ambiguous, unmatched = [], [], []
        seen_emails = set()

        for row in rows:
            email = _pick(row, ('email', 'mail', 'ایمیل', 'پست الکترونیک')).strip().lower()
            name = _pick(row, ('name', 'fullname', 'نام', 'نام و نام خانوادگی')).strip()
            phone = _pick(row, ('phone', 'mobile', 'شماره', 'موبایل', 'شمارهٔ تماس')).strip()
            if not email:
                continue
            if domain and not email.endswith('@' + domain):
                unmatched.append((email, name, f'دامنه‌اش @{domain} نیست'))
                continue
            if email in seen_emails:
                unmatched.append((email, name, 'در فایل تکراری است'))
                continue
            seen_emails.add(email)

            hits = by_phone.get(normalize_phone(phone), []) if phone else []
            if not hits and name:
                hits = by_name.get(normalize_name(name), [])

            if len(hits) == 1:
                matched.append((hits[0], email))
            elif len(hits) > 1:
                # تطبیق مبهم هرگز حدس زده نمی‌شود: ایمیلِ اشتباه خطا نمی‌دهد،
                # فقط دعوت را بی‌صدا به آدم دیگری می‌فرستد.
                ambiguous.append((email, name, f'{len(hits)} نفر با این مشخصات'))
            else:
                unmatched.append((email, name, 'کاربری با این نام/شماره پیدا نشد'))

        self._report('تطبیق‌شده', [(u.get_full_name() or u.username, e, '') for u, e in matched])
        self._report('مبهم — دستی وصل شود', ambiguous)
        self._report('بی‌تطبیق', unmatched)

        if not opts['apply']:
            self.stdout.write(self.style.WARNING(
                '\nهیچ چیزی نوشته نشد. برای اعمال، دوباره با --apply اجرا کنید.'))
            return

        with transaction.atomic():
            created = updated = 0
            for user, email in matched:
                if (user.email or '').lower() != email:
                    user.email = email
                    user.save(update_fields=['email'])
                box, made = OutlookMailbox.objects.update_or_create(
                    user=user, defaults={'email': email, 'is_active': True})
                created += 1 if made else 0
                updated += 0 if made else 1

            if opts['deactivate_missing']:
                keep = [u.pk for u, _ in matched]
                OutlookMailbox.objects.exclude(user_id__in=keep).update(is_active=False)

        self.stdout.write(self.style.SUCCESS(
            f'\nصندوق تازه: {created} — به‌روزشده: {updated}'))
        if ambiguous or unmatched:
            self.stdout.write(
                'موارد مبهم و بی‌تطبیق را از پنل ادمین جنگو دستی وصل کنید '
                '(ایمیلِ اشتباه خطا نمی‌دهد، فقط دعوتِ گم‌شده).')

    def _report(self, title: str, rows):
        self.stdout.write(f'\n— {title} ({len(rows)}) —')
        for a, b, note in rows:
            line = f'  {a:<28} {b}'
            self.stdout.write(f'{line}   {note}' if note else line)


def _pick(row: dict, keys) -> str:
    """اولین ستونی که سرصفحه‌اش با یکی از این نام‌ها می‌خورد."""
    lowered = {(k or '').strip().lower(): v for k, v in row.items()}
    for key in keys:
        if key in lowered and lowered[key]:
            return str(lowered[key])
    return ''
