"""
ارسال یک پیامک آزمایشی — برای بررسی سلامت پنل پیامک.

    python manage.py test_sms 09121234567
    python manage.py test_sms 09121234567 --text "متن دلخواه"

خطاهای رایج (توکن نامعتبر، IP غیرمجاز، اعتبار ناکافی) با پیام فارسی
گزارش می‌شوند تا معلوم باشد مشکل از سامانه است یا از پنل.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from meetings.sms import is_valid_phone, normalize_phone, send_text


class Command(BaseCommand):
    help = 'ارسال یک پیامک آزمایشی به شمارهٔ داده‌شده'

    def add_arguments(self, parser):
        parser.add_argument('phone', help='شمارهٔ گیرنده، مثلاً 09121234567')
        parser.add_argument('--text', default='پیامک آزمایشی سامانهٔ جلسات گرین‌پی')

    def handle(self, *args, **opts):
        phone = normalize_phone(opts['phone'])
        if not is_valid_phone(phone):
            raise CommandError(f'شمارهٔ نامعتبر: {opts["phone"]}')

        if not settings.PISHGAM_SMS_TOKEN:
            raise CommandError('PISHGAM_SMS_TOKEN تنظیم نشده — /etc/greenpay.env را ببینید.')

        self.stdout.write(f'فرستنده: {settings.PISHGAM_SMS_SENDER} → گیرنده: {phone}')
        result = send_text(phone, opts['text'], tag='greenpay-test')

        if result.sent:
            self.stdout.write(self.style.SUCCESS('✓ پیامک تحویل سرویس شد.'))
        else:
            raise CommandError(f'✗ ارسال نشد — {result.detail}')
