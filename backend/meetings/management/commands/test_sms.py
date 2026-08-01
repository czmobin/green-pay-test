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
            self.stdout.write('مقایسهٔ پاسخ سرویس با توکن درست و توکن نامعتبر '
                              '(بدنهٔ خالی — پیامکی فرستاده نمی‌شود):\n')
            rows = probe()
            for label, code, body in rows:
                self.stdout.write(f'  {label:22} → HTTP {code}  {body}')
            codes = {label: code for label, code, _ in rows}
            self.stdout.write('')
            mine = codes.get('توکن پیکربندی‌شده')
            if mine == 401:
                self.stdout.write(self.style.ERROR(
                    'نتیجه: توکن پذیرفته نمی‌شود — PISHGAM_SMS_TOKEN را در پنل بررسی کنید.'))
            elif mine == 428:
                self.stdout.write(self.style.WARNING(
                    'نتیجه: توکن سالم است ولی IP این سرور مجاز نیست.\n'
                    'در پنل پیشگام رایان، IP خروجی سرور را به فهرست مجاز همین توکن اضافه کنید.'))
            else:
                self.stdout.write(self.style.SUCCESS(
                    'نتیجه: احراز هویت و IP هر دو درست‌اند؛ سرویس فقط به بدنهٔ خالی ایراد گرفت '
                    f'(HTTP {mine}) که برای این آزمون طبیعی است.\n'
                    'برای ارسال واقعی همین دستور را بدون --diagnose بزنید.'))
            return

        self.stdout.write(f'فرستنده: {settings.PISHGAM_SMS_SENDER} → گیرنده: {phone}')
        result = send_text(phone, opts['text'], tag='greenpay-test')

        if result.sent:
            self.stdout.write(self.style.SUCCESS(
                f'✓ پیامک تحویل سرویس شد — شناسهٔ پیام: {result.msg_id or "—"}\n'
                'اگر نرسید، گزارش تحویل همین شناسه را در پنل پیامک ببینید.'))
        else:
            raise CommandError(f'✗ ارسال نشد — {result.detail}')
