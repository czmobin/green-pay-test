"""
ارسال یک پیامک آزمایشی — برای بررسی سلامت پنل پیامک.

    python manage.py test_sms 09121234567
    python manage.py test_sms 09121234567 --text "متن دلخواه"

خطاهای رایج (توکن نامعتبر، IP غیرمجاز، اعتبار ناکافی) با پیام فارسی
گزارش می‌شوند تا معلوم باشد مشکل از سامانه است یا از پنل.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from meetings.sms import is_valid_phone, normalize_phone, probe, send_text


class Command(BaseCommand):
    help = 'ارسال یک پیامک آزمایشی به شمارهٔ داده‌شده'

    def add_arguments(self, parser):
        parser.add_argument('phone', help='شمارهٔ گیرنده، مثلاً 09121234567')
        parser.add_argument('--text', default='پیامک آزمایشی سامانهٔ جلسات گرین‌پی')
        parser.add_argument('--diagnose', action='store_true',
                            help='به‌جای ارسال، علت رد شدن را تشخیص بده (برای دادن به پشتیبانی)')

    def handle(self, *args, **opts):
        phone = normalize_phone(opts['phone'])
        if not is_valid_phone(phone):
            raise CommandError(f'شمارهٔ نامعتبر: {opts["phone"]}')

        if not settings.PISHGAM_SMS_TOKEN:
            raise CommandError('PISHGAM_SMS_TOKEN تنظیم نشده — /etc/greenpay.env را ببینید.')

        if opts['diagnose']:
            self.stdout.write('مقایسهٔ پاسخ سرویس با توکن درست و توکن نامعتبر:\n')
            rows = probe(phone)
            for label, code, body in rows:
                self.stdout.write(f'  {label:22} → HTTP {code}  {body}')
            codes = {label: code for label, code, _ in rows}
            self.stdout.write('')
            if codes.get('توکن عمداً نامعتبر') == 401 and codes.get('توکن پیکربندی‌شده') == 428:
                self.stdout.write(self.style.WARNING(
                    'نتیجه: توکن سالم است (توکن نامعتبر ۴۰۱ می‌گیرد، توکن ما نمی‌گیرد).\n'
                    'سرویس فقط IP را رد می‌کند — فهرست IPهای مجازِ همین توکن در پنل باید بررسی شود.'))
            elif codes.get('توکن پیکربندی‌شده') == 401:
                self.stdout.write(self.style.ERROR('نتیجه: توکن پذیرفته نمی‌شود — توکن را در پنل بررسی کنید.'))
            elif codes.get('توکن پیکربندی‌شده') and 200 <= codes['توکن پیکربندی‌شده'] < 300:
                self.stdout.write(self.style.SUCCESS('نتیجه: سرویس درخواست را پذیرفت.'))
            return

        self.stdout.write(f'فرستنده: {settings.PISHGAM_SMS_SENDER} → گیرنده: {phone}')
        result = send_text(phone, opts['text'], tag='greenpay-test')

        if result.sent:
            self.stdout.write(self.style.SUCCESS('✓ پیامک تحویل سرویس شد.'))
        else:
            raise CommandError(f'✗ ارسال نشد — {result.detail}')
